
const express=require('express');const sqlite3=require('sqlite3').verbose();const cors=require('cors');const bodyParser=require('body-parser');const multer=require('multer');const fs=require('fs');const crypto=require('crypto');
const app=express();const PORT=process.env.PORT||3000;
app.use(cors());app.use(bodyParser.json({limit:'20mb'}));app.use(express.static('public'));app.use('/uploads',express.static('uploads'));
if(!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const storage=multer.diskStorage({destination:(r,f,cb)=>cb(null,'uploads/'),filename:(r,f,cb)=>cb(null,Date.now()+'-'+f.originalname)});
const upload=multer({storage});
const db=new sqlite3.Database('dwb.db');

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS produtos (id TEXT PRIMARY KEY,nome TEXT,categoria TEXT,imagem TEXT,descricaoCurta TEXT,descricaoCompleta TEXT,preco REAL,precoPromo REAL,linkCheckout TEXT,linkProduto TEXT,whatsapp TEXT,status TEXT,destaque INTEGER,destaquePrincipal INTEGER,ordem INTEGER,selo TEXT,avaliacao REAL,comissaoAfiliado REAL DEFAULT 30,permiteAfiliado INTEGER DEFAULT 1,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS afiliados (id TEXT PRIMARY KEY,nome TEXT NOT NULL,email TEXT UNIQUE,telefone TEXT,codigo TEXT UNIQUE NOT NULL,porcentagemPadrao REAL DEFAULT 30,status TEXT DEFAULT 'Ativo',saldo REAL DEFAULT 0,totalVendas REAL DEFAULT 0,totalComissoes REAL DEFAULT 0,chavePix TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS afiliado_produtos (id TEXT PRIMARY KEY,afiliadoId TEXT,produtoId TEXT,porcentagem REAL,linkPersonalizado TEXT,FOREIGN KEY(afiliadoId) REFERENCES afiliados(id),FOREIGN KEY(produtoId) REFERENCES produtos(id),UNIQUE(afiliadoId,produtoId))`);
  db.run(`CREATE TABLE IF NOT EXISTS cliques (id TEXT PRIMARY KEY,afiliadoId TEXT,codigo TEXT,produtoId TEXT,ip TEXT,userAgent TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS vendas (id TEXT PRIMARY KEY,produtoId TEXT,afiliadoId TEXT,codigoRef TEXT,valor REAL,comissao REAL,porcentagem REAL,status TEXT DEFAULT 'Pendente',clienteNome TEXT,clienteEmail TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY,valor TEXT)`);
  
  db.get("SELECT COUNT(*) as c FROM produtos",(e,row)=>{
    if(row && row.c===0 && fs.existsSync('./seed.json')){
      const seed=require('./seed.json');
      const stmt=db.prepare(`INSERT INTO produtos (id,nome,categoria,imagem,descricaoCurta,descricaoCompleta,preco,precoPromo,linkCheckout,linkProduto,whatsapp,status,destaque,destaquePrincipal,ordem,selo,avaliacao,comissaoAfiliado,permiteAfiliado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      seed.forEach(p=>{stmt.run(p.id,p.nome,p.categoria,p.imagem,p.descricaoCurta,p.descricaoCompleta,p.preco,p.precoPromo,p.linkCheckout,p.linkProduto,p.whatsapp,p.status,p.destaque?1:0,p.destaquePrincipal?1:0,p.ordem,p.selo,p.avaliacao, p.comissaoAfiliado||30, p.permiteAfiliado!=0?1:0)});
      stmt.finalize();
      console.log('Seed produtos ok');
    }
  });
  db.get("SELECT valor FROM config WHERE chave='comissao_global'",(e,row)=>{
    if(!row) db.run("INSERT INTO config (chave,valor) VALUES ('comissao_global','30')");
  });
});

function gerarCodigo(nome){
  const base = nome.normalize('NFD').replace(/[\W_]+/g,'').substring(0,4).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return base+rand;
}

// === PRODUTOS ===
app.get('/api/produtos',(req,res)=>{
  let sql="SELECT * FROM produtos";const where=[];const params=[];
  if(req.query.ativos==='1') where.push("status='Ativo'");
  if(where.length) sql+=" WHERE "+where.join(" AND ");
  sql+=" ORDER BY ordem ASC";
  db.all(sql,params,(err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows.map(r=>({...r,destaque:!!r.destaque,destaquePrincipal:!!r.destaquePrincipal,permiteAfiliado:!!r.permiteAfiliado})));
  });
});
app.post('/api/produtos',(req,res)=>{
  const p=req.body;const id=p.id||'prod_'+Date.now();
  db.run(`INSERT INTO produtos (id,nome,categoria,imagem,descricaoCurta,descricaoCompleta,preco,precoPromo,linkCheckout,linkProduto,whatsapp,status,destaque,destaquePrincipal,ordem,selo,avaliacao,comissaoAfiliado,permiteAfiliado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [id,p.nome,p.categoria,p.imagem,p.descricaoCurta,p.descricaoCompleta,p.preco||0,p.precoPromo||0,p.linkCheckout,p.linkProduto,p.whatsapp,p.status||'Ativo',p.destaque?1:0,p.destaquePrincipal?1:0,p.ordem||99,p.selo||'NENHUM',p.avaliacao||4.9,p.comissaoAfiliado||30,p.permiteAfiliado?1:0],
  (err)=>{ if(err) return res.status(500).json({error:err.message}); res.json({id,...p}); });
});
app.put('/api/produtos/:id',(req,res)=>{
  const p=req.body;
  db.run(`UPDATE produtos SET nome=?,categoria=?,imagem=?,descricaoCurta=?,descricaoCompleta=?,preco=?,precoPromo=?,linkCheckout=?,linkProduto=?,whatsapp=?,status=?,destaque=?,destaquePrincipal=?,ordem=?,selo=?,avaliacao=?,comissaoAfiliado=?,permiteAfiliado=? WHERE id=?`,
  [p.nome,p.categoria,p.imagem,p.descricaoCurta,p.descricaoCompleta,p.preco,p.precoPromo,p.linkCheckout,p.linkProduto,p.whatsapp,p.status,p.destaque?1:0,p.destaquePrincipal?1:0,p.ordem,p.selo,p.avaliacao,p.comissaoAfiliado||30,p.permiteAfiliado?1:0,req.params.id],
  (err)=>{ res.json({id:req.params.id,...p}); });
});
app.delete('/api/produtos/:id',(req,res)=>{ db.run("DELETE FROM produtos WHERE id=?",[req.params.id],function(){ res.json({deleted:this.changes}); }); });

// === AFILIADOS ===
app.get('/api/afiliados',(req,res)=>{
  db.all("SELECT * FROM afiliados ORDER BY created_at DESC",(err,rows)=>{ res.json(rows||[]); });
});
app.post('/api/afiliados',(req,res)=>{
  const a=req.body;const id=a.id||'afil_'+Date.now();const codigo=a.codigo||gerarCodigo(a.nome);
  db.run(`INSERT INTO afiliados (id,nome,email,telefone,codigo,porcentagemPadrao,status,chavePix) VALUES (?,?,?,?,?,?,?,?)`,
  [id,a.nome,a.email,a.telefone,codigo,a.porcentagemPadrao||30,a.status||'Ativo',a.chavePix||''],
  function(err){ if(err) return res.status(500).json({error:err.message}); res.json({id,codigo,...a}); });
});
app.put('/api/afiliados/:id',(req,res)=>{
  const a=req.body;
  db.run(`UPDATE afiliados SET nome=?,email=?,telefone=?,porcentagemPadrao=?,status=?,chavePix=? WHERE id=?`,
  [a.nome,a.email,a.telefone,a.porcentagemPadrao,a.status,a.chavePix,req.params.id],
  (err)=>{ res.json({id:req.params.id,...a}); });
});
app.delete('/api/afiliados/:id',(req,res)=>{ db.run("DELETE FROM afiliados WHERE id=?",[req.params.id],function(){ res.json({deleted:this.changes}); }); });

// Config porcentagem por produto por afiliado
app.get('/api/afiliado-produtos/:afiliadoId',(req,res)=>{
  db.all(`SELECT ap.*, p.nome as produtoNome, p.preco, p.precoPromo FROM afiliado_produtos ap JOIN produtos p ON p.id=ap.produtoId WHERE ap.afiliadoId=?`,[req.params.afiliadoId],(err,rows)=>{ res.json(rows||[]); });
});
app.post('/api/afiliado-produtos',(req,res)=>{
  const {afiliadoId,produtoId,porcentagem}=req.body;const id='ap_'+Date.now();
  const link=`/produto/${produtoId}?ref=${afiliadoId}`;
  db.run(`INSERT OR REPLACE INTO afiliado_produtos (id,afiliadoId,produtoId,porcentagem,linkPersonalizado) VALUES (?,?,?,?,?)`,[id,afiliadoId,produtoId,porcentagem,link],(err)=>{ res.json({id,afiliadoId,produtoId,porcentagem,linkPersonalizado:link}); });
});

// Tracking de clique
app.post('/api/track/clique',(req,res)=>{
  const {codigo,produtoId}=req.body;const id='clk_'+Date.now();
  db.get("SELECT id FROM afiliados WHERE codigo=?",[codigo],(err,afil)=>{
    if(!afil) return res.json({ok:false});
    db.run("INSERT INTO cliques (id,afiliadoId,codigo,produtoId,ip,userAgent) VALUES (?,?,?,?,?,?)",[id,afil.id,codigo,produtoId,req.ip,req.headers['user-agent']],()=>{ res.json({ok:true}); });
  });
});

// Registrar venda (simula checkout)
app.post('/api/vendas',(req,res)=>{
  const {produtoId,codigoRef,clienteNome,clienteEmail,valor}=req.body;const id='vnd_'+Date.now();
  db.get("SELECT id,porcentagemPadrao FROM afiliados WHERE codigo=?",[codigoRef],(err,afil)=>{
    let afiliadoId=null;let porcentagem=0;let comissao=0;
    if(afil){
      afiliadoId=afil.id;
      // Verifica porcentagem personalizada por produto
      db.get("SELECT porcentagem FROM afiliado_produtos WHERE afiliadoId=? AND produtoId=?",[afil.id,produtoId],(e2,row2)=>{
        const finalize=()=>{
          if(!porcentagem){
            db.get("SELECT comissaoAfiliado FROM produtos WHERE id=?",[produtoId],(e3,prod)=>{
              porcentagem = porcentagem || (prod?prod.comissaoAfiliado:afil.porcentagemPadrao);
              comissao = (valor||0)*porcentagem/100;
              inserirVenda();
            });
          }else{ inserirVenda(); }
        };
        function inserirVenda(){
          comissao = comissao || (valor||0)*porcentagem/100;
          db.run("INSERT INTO vendas (id,produtoId,afiliadoId,codigoRef,valor,comissao,porcentagem,clienteNome,clienteEmail) VALUES (?,?,?,?,?,?,?,?,?)",[id,produtoId,afiliadoId,codigoRef,valor,comissao,porcentagem,clienteNome,clienteEmail],()=>{
            if(afiliadoId){
              db.run("UPDATE afiliados SET saldo=saldo+?, totalComissoes=totalComissoes+?, totalVendas=totalVendas+? WHERE id=?",[comissao,comissao,valor,afiliadoId]);
            }
            res.json({id,comissao,porcentagem,afiliadoId});
          });
        }
        if(row2){ porcentagem=row2.porcentagem; finalize(); } else { finalize(); }
      });
    }else{
      db.run("INSERT INTO vendas (id,produtoId,codigoRef,valor,comissao,porcentagem,clienteNome,clienteEmail) VALUES (?,?,?,?,?,?,?,?)",[id,produtoId,codigoRef,valor||0,0,0,clienteNome,clienteEmail],()=>{ res.json({id,comissao:0}); });
    }
  });
});

app.get('/api/vendas',(req,res)=>{
  let sql="SELECT v.*, p.nome as produtoNome, a.nome as afiliadoNome, a.codigo as afiliadoCodigo FROM vendas v LEFT JOIN produtos p ON p.id=v.produtoId LEFT JOIN afiliados a ON a.id=v.afiliadoId ORDER BY v.created_at DESC";
  db.all(sql,(err,rows)=>{ res.json(rows||[]); });
});
app.get('/api/stats/afiliado/:codigo',(req,res)=>{
  db.get("SELECT * FROM afiliados WHERE codigo=?",[req.params.codigo],(err,afil)=>{
    if(!afil) return res.status(404).json({error:'Afiliado nao encontrado'});
    db.all("SELECT COUNT(*) as cliques FROM cliques WHERE codigo=?",[req.params.codigo],(e1,r1)=>{
      db.all("SELECT COUNT(*) as vendas, SUM(valor) as totalVendas, SUM(comissao) as totalComissao FROM vendas WHERE codigoRef=?",[req.params.codigo],(e2,r2)=>{
        db.all("SELECT v.*, p.nome as produtoNome FROM vendas v LEFT JOIN produtos p ON p.id=v.produtoId WHERE v.codigoRef=? ORDER BY v.created_at DESC LIMIT 50",[req.params.codigo],(e3,vendas)=>{
          res.json({afiliado:afil, cliques:r1[0].cliques||0, vendas:r2[0].vendas||0, totalVendas:r2[0].totalVendas||0, totalComissao:r2[0].totalComissao||0, ultimasVendas:vendas});
        });
      });
    });
  });
});
app.get('/api/config',(req,res)=>{ db.all("SELECT * FROM config",(e,rows)=>{ const obj={}; (rows||[]).forEach(r=>obj[r.chave]=r.valor); res.json(obj); }); });
app.post('/api/config',(req,res)=>{ const {chave,valor}=req.body; db.run("INSERT OR REPLACE INTO config (chave,valor) VALUES (?,?)",[chave,valor],()=>{ res.json({chave,valor}); }); });

app.post('/api/upload',upload.single('imagem'),(req,res)=>{ res.json({url:`/uploads/${req.file.filename}`}); });
app.get('/api/categorias',(req,res)=>{ db.all("SELECT DISTINCT categoria FROM produtos WHERE status='Ativo' ORDER BY categoria",(e,rows)=>{ res.json(rows.map(r=>r.categoria)); }); });

app.listen(PORT,()=>console.log(`DWB com Afiliados rodando http://localhost:${PORT}`));
