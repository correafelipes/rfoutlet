const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Servir os arquivos do Frontend na mesma porta
app.use(express.static(path.join(__dirname, '../frontend')));

// Banco de Dados Local (SQLite para testes rápidos, Padrão Integra)
const db = new sqlite3.Database('./integra_rfoutlet.db', (err) => {
    if (err) {
        console.error('❌ Erro Inesperado no Banco', err);
    } else {
        console.log('✅ Banco de Dados conectado (SQLite). Preparando Tabelas (v0.1)...');
        setupDatabase();
    }
});

function setupDatabase() {
    db.serialize(() => {
        // Tabela de Usuários/Vendedores
        db.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                login TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                funcao TEXT NOT NULL,
                permissoes TEXT DEFAULT 'BASICO',
                ativo BOOLEAN DEFAULT true
            )
        `);

        // Tabela de Estoque (Modificada para Omnichannel)
        // O campo 'local' será 'LOJA' ou o ID do Representante (ex: 'REP_3')
        db.run(`
            CREATE TABLE IF NOT EXISTS estoque (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT NOT NULL,
                marca TEXT NOT NULL,
                categoria TEXT NOT NULL,
                tamanho TEXT,
                quantidade INTEGER DEFAULT 0,
                preco REAL NOT NULL,
                local TEXT DEFAULT 'LOJA'
            )
        `);

        // Tabela de Ponto RH
        db.run(`
            CREATE TABLE IF NOT EXISTS ponto_horas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER NOT NULL,
                usuario_nome TEXT,
                tipo TEXT NOT NULL, -- 'ENTRADA', 'SAIDA'
                data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Pré-vendas (Pipeline/Forecast)
        db.run(`
            CREATE TABLE IF NOT EXISTS pre_vendas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendedor_id INTEGER,
                vendedor_nome TEXT,
                cliente_cpf TEXT,
                valor_total REAL,
                status TEXT DEFAULT 'PENDENTE', -- 'PENDENTE', 'CONVERTIDA', 'CANCELADA'
                origem TEXT DEFAULT 'LOJA', -- 'LOJA' ou 'APP_REPRESENTANTE'
                data TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Movimentação Diária
        db.run(`
            CREATE TABLE IF NOT EXISTS movimentacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                valor REAL NOT NULL,
                descricao TEXT,
                data TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Vendas (Novo - Para comissões e métricas)
        db.run(`
            CREATE TABLE IF NOT EXISTS vendas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendedor_id INTEGER,
                vendedor_nome TEXT,
                produto_codigo TEXT,
                marca TEXT,
                quantidade INTEGER,
                valor_total REAL,
                mes TEXT, -- ex: '2026-03' para facilitar agrupamento
                data TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Escala
        db.run(`
            CREATE TABLE IF NOT EXISTS escala (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER,
                data TEXT NOT NULL,
                status TEXT NOT NULL
            )
        `);

        console.log('✅ Tabelas Omnichannel (v0.1) criadas com sucesso.');

        // Populando dados (Seeding) se for primeiro uso
        db.get('SELECT COUNT(*) as count FROM usuarios', (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO usuarios (nome, login, senha, funcao, permissoes) VALUES 
                    ('Administrador', 'admin', '123456', 'Gerente Geral', 'TOTAL'),
                    ('Maria (Vendedora)', 'maria', '123', 'Vendedora', 'BASICO'),
                    ('João (Representante)', 'joao', '123', 'Representante Externo', 'BASICO'),
                    ('Márcio', 'marcio', '123', 'Estoquista', 'ESTOQUE')
                `);
                console.log('👥 Usuários base criados.');
            }
        });

        db.get('SELECT COUNT(*) as count FROM estoque', (err, row) => {
            if (row && row.count === 0) {
                // Inserir apenas se estiver vazio
                const stmt = db.prepare('INSERT INTO estoque (codigo, marca, categoria, tamanho, quantidade, preco, local) VALUES (?, ?, ?, ?, ?, ?, ?)');
                stmt.run('DAM-JNS-01', 'Damyller', 'Calça Jeans Skinny Masculina', '42', 20, 329.90, 'LOJA');
                stmt.run('DAM-JNS-02', 'Damyller', 'Calça Jeans Flare Feminina', '38', 15, 349.90, 'LOJA');
                stmt.run('DAM-SHRT-03', 'Damyller', 'Shorts Jeans Feminino', '36', 12, 189.90, 'LOJA');
                stmt.run('TXC-TSH-01', 'TXC', 'Camiseta Básica Logo Grande', 'G', 45, 99.90, 'LOJA');
                stmt.run('LEV-501-01', 'Levi\'s', 'Calça Jeans 501 Original', '40', 8, 499.00, 'LOJA');
                // Simulando que o João já pegou algumas camisetas pra vender na rua
                stmt.run('TXC-TSH-01', 'TXC', 'Camiseta Básica Logo Grande', 'G', 5, 99.90, 'REP_3');
                stmt.finalize();
                console.log("👕 Estoque inicial expandido (com divisão de Local: Loja e Rua).");
            }
        });

        db.get('SELECT COUNT(*) as count FROM pre_vendas', (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO pre_vendas (vendedor_id, vendedor_nome, cliente_cpf, valor_total, origem) VALUES 
                    (2, 'Maria (Vendedora)', '111.222.333-44', 800.00, 'LOJA'),
                    (3, 'João (Representante)', '999.888.777-66', 1250.00, 'APP_REPRESENTANTE')
                `);
            }
        });
    });
}

// ========================== ROTAS ==========================

// Login
app.post('/api/login', (req, res) => {
    const { login, senha } = req.body;
    db.get('SELECT id, nome, funcao, permissoes FROM usuarios WHERE login = ? AND senha = ? AND ativo = true', [login, senha], (err, row) => {
        if (row) {
            res.json({ success: true, user: row });
        } else {
            res.status(401).json({ success: false, message: 'Login ou senha incorretos' });
        }
    });
});

// Registrar Ponto (Entrada / Saída)
app.post('/api/ponto', (req, res) => {
    const { usuario_id, usuario_nome, tipo } = req.body;
    db.run('INSERT INTO ponto_horas (usuario_id, usuario_nome, tipo) VALUES (?, ?, ?)', [usuario_id, usuario_nome, tipo], function(err) {
        if (err) return res.status(500).json({ error: 'Erro ao registrar ponto' });
        res.json({ success: true, message: `Ponto de ${tipo} registrado com sucesso!`, id: this.lastID });
    });
});

// Vendedores / Representantes
app.get('/api/vendedores', (req, res) => {
    db.all("SELECT id, nome, login, funcao FROM usuarios WHERE funcao LIKE '%Vendedor%' OR funcao LIKE '%Representante%' AND ativo = true", [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar vendedores' });
        res.json(rows);
    });
});

// Cadastrar Novo Vendedor/Usuário
app.post('/api/usuarios', (req, res) => {
    const { nome, login, senha, funcao } = req.body;
    db.run('INSERT INTO usuarios (nome, login, senha, funcao) VALUES (?, ?, ?, ?)', 
        [nome, login, senha, funcao || 'Vendedor'], 
        function(err) {
            if (err) return res.status(500).json({ error: 'Erro ao criar usuário (Login pode já existir)' });
            res.json({ success: true, id: this.lastID });
    });
});

// Estoque Dinâmico (Aceita filtro de ?local=LOJA ou ?local=REP_3)
app.get('/api/estoque', (req, res) => {
    const local = req.query.local || 'LOJA';
    db.all('SELECT * FROM estoque WHERE local = ? ORDER BY marca, categoria', [local], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar estoque' });
        res.json(rows);
    });
});

// Transferência para Maleta (Rua)
app.post('/api/estoque/transferir', (req, res) => {
    const { codigo, quantidade_transferir, representante_id } = req.body;
    const local_destino = `REP_${representante_id}`;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 1. Tira da loja
        db.run('UPDATE estoque SET quantidade = quantidade - ? WHERE codigo = ? AND local = "LOJA"', [quantidade_transferir, codigo]);
        
        // 2. Coloca na maleta do representante
        // Busca se ele já tem esse item na maleta
        db.get('SELECT id FROM estoque WHERE codigo = ? AND local = ?', [codigo, local_destino], (err, row) => {
            if (row) {
                // Já tem, só soma
                db.run('UPDATE estoque SET quantidade = quantidade + ? WHERE id = ?', [quantidade_transferir, row.id]);
            } else {
                // Não tem, copia do estoque da loja e cria pra ele
                db.run(`INSERT INTO estoque (codigo, marca, categoria, tamanho, quantidade, preco, local) 
                        SELECT codigo, marca, categoria, tamanho, ?, preco, ? 
                        FROM estoque WHERE codigo = ? AND local = "LOJA" LIMIT 1`, 
                        [quantidade_transferir, local_destino, codigo]);
            }
        });

        db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: 'Erro ao transferir estoque' });
            res.json({ success: true, message: `Mercadoria enviada para a maleta do Representante #${representante_id}` });
        });
    });
});

// Estatísticas Omnichannel e Relatórios
app.get('/api/relatorios/vendas', (req, res) => {
    const { data_inicio, data_fim } = req.query;
    let filtro = '';
    let params = [];

    if (data_inicio && data_fim) {
        filtro = ' WHERE date(data) BETWEEN ? AND ? ';
        params = [data_inicio, data_fim];
    }

    const relatorio = {};

    db.serialize(() => {
        // Pipeline: Previsão de Caixa Global (Pré-vendas + App)
        db.get("SELECT SUM(valor_total) as previsao_total FROM pre_vendas WHERE status = 'PENDENTE'", (err, prev) => {
            relatorio.previsao_pipeline = prev ? prev.previsao_total : 0;

            // 1. Vendas por Marca
            db.all(`SELECT marca, SUM(quantidade) as qtd_total, SUM(valor_total) as valor_total FROM vendas ${filtro} GROUP BY marca ORDER BY valor_total DESC`, params, (err, marcas) => {
                relatorio.por_marca = marcas || [];

                // 2. Vendas por Vendedor (Comissões)
                db.all(`SELECT vendedor_nome, SUM(quantidade) as qtd_total, SUM(valor_total) as valor_total FROM vendas ${filtro} GROUP BY vendedor_nome ORDER BY valor_total DESC`, params, (err, vendedores) => {
                    relatorio.por_vendedor = vendedores || [];

                    // 3. Comparativo Mensal
                    db.all('SELECT mes, SUM(valor_total) as total_mes FROM vendas GROUP BY mes ORDER BY mes DESC LIMIT 12', [], (err, meses) => {
                        if (meses && meses.length >= 2) {
                            const atual = meses[0].total_mes;
                            const anterior = meses[1].total_mes;
                            const variacao = ((atual - anterior) / anterior) * 100;
                            meses[0].comparativo = {
                                mes_anterior: meses[1].mes,
                                valor_anterior: anterior,
                                porcentagem: variacao.toFixed(2) + '%'
                            };
                        }
                        relatorio.por_mes = meses || [];
                        
                        res.json(relatorio);
                    });
                });
            });
        });
    });
});

// Rotas de Venda antigas
app.post('/api/vendas', (req, res) => {
    const { vendedor_id, vendedor_nome, produto_codigo, marca, quantidade, valor_total, origem } = req.body;
    const local_baixa = origem === 'APP_REPRESENTANTE' ? `REP_${vendedor_id}` : 'LOJA';
    const mes = new Date().toISOString().slice(0, 7); 

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run(`INSERT INTO vendas (vendedor_id, vendedor_nome, produto_codigo, marca, quantidade, valor_total, mes) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [vendedor_id, vendedor_nome, produto_codigo, marca, quantidade, valor_total, mes]);

        db.run(`UPDATE estoque SET quantidade = quantidade - ? WHERE codigo = ? AND local = ?`, [quantidade, produto_codigo, local_baixa]);

        db.run(`INSERT INTO movimentacoes (tipo, valor, descricao) VALUES ('ENTRADA', ?, ?)`, 
                [valor_total, `Venda: ${quantidade}x ${marca} (${produto_codigo}) - Origem: ${origem || 'LOJA'}`]);

        db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: 'Erro ao processar venda' });
            res.json({ success: true, message: 'Venda registrada com sucesso!' });
        });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 [BANE/NERO] Backend do RF Outlet V0.1 (OMNICHANNEL) Rodando na Porta ${PORT}`);
});