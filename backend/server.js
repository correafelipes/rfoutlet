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
        console.log('✅ Banco de Dados conectado (SQLite). Preparando Tabelas...');
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

        // Tabela de Estoque
        db.run(`
            CREATE TABLE IF NOT EXISTS estoque (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE NOT NULL,
                marca TEXT NOT NULL,
                categoria TEXT NOT NULL,
                tamanho TEXT,
                quantidade INTEGER DEFAULT 0,
                preco REAL NOT NULL
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

        console.log('✅ Tabelas criadas (Usuários, Estoque, Caixa, Vendas, Escala).');

        // Populando dados (Seeding)
        db.get('SELECT COUNT(*) as count FROM usuarios', (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO usuarios (nome, login, senha, funcao, permissoes) VALUES 
                    ('Administrador', 'admin', '123456', 'Gerente Geral', 'TOTAL'),
                    ('Maria (Vendedora)', 'maria', '123', 'Vendedora', 'BASICO'),
                    ('João (Vendedor)', 'joao', '123', 'Vendedor', 'BASICO'),
                    ('Márcio', 'marcio', '123', 'Estoquista', 'ESTOQUE')
                `);
                console.log('👥 Usuários base criados.');
            }
        });

        db.get('SELECT COUNT(*) as count FROM estoque', (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO estoque (codigo, marca, categoria, tamanho, quantidade, preco) VALUES 
                    ('DAM-JNS-01', 'Damyller', 'Calça Jeans Skinny Masculina', '42', 20, 329.90),
                    ('DAM-JNS-02', 'Damyller', 'Calça Jeans Flare Feminina', '38', 15, 349.90),
                    ('DAM-SHRT-03', 'Damyller', 'Shorts Jeans Feminino', '36', 12, 189.90),
                    ('TXC-TSH-01', 'TXC', 'Camiseta Básica Logo Grande', 'G', 45, 99.90),
                    ('TXC-TSH-02', 'TXC', 'Camiseta Polo Custom Fit', 'M', 25, 159.90),
                    ('TXC-JNS-03', 'TXC', 'Calça Jeans Reta', '44', 10, 289.90),
                    ('LEV-501-01', 'Levi''s', 'Calça Jeans 501 Original', '40', 8, 499.00),
                    ('LEV-511-02', 'Levi''s', 'Calça Jeans 511 Slim', '42', 14, 459.00),
                    ('LAC-POLO-01', 'Lacoste', 'Camisa Polo Piquet L.12.12', '4', 30, 549.00),
                    ('CK-UND-01', 'Calvin Klein', 'Cueca Boxer Cotton (Kit 3)', 'M', 50, 129.00)
                `);
                console.log("👕 Estoque expandido com códigos oficiais.");
            }
        });

        // Simulando algumas vendas de meses anteriores para o comparativo
        db.get('SELECT COUNT(*) as count FROM vendas', (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO vendas (vendedor_id, vendedor_nome, produto_codigo, marca, quantidade, valor_total, mes, data) VALUES 
                    (2, 'Maria (Vendedora)', 'DAM-JNS-01', 'Damyller', 2, 659.80, '2026-02', '2026-02-15 10:00:00'),
                    (3, 'João (Vendedor)', 'TXC-TSH-01', 'TXC', 3, 299.70, '2026-02', '2026-02-20 14:00:00'),
                    (2, 'Maria (Vendedora)', 'LEV-501-01', 'Levi''s', 1, 499.00, '2026-03', '2026-03-05 11:30:00'),
                    (3, 'João (Vendedor)', 'LAC-POLO-01', 'Lacoste', 2, 1098.00, '2026-03', '2026-03-10 16:20:00'),
                    (2, 'Maria (Vendedora)', 'DAM-JNS-02', 'Damyller', 1, 349.90, '2026-03', '2026-03-25 09:15:00')
                `);
                console.log("💰 Vendas de teste inseridas (para comparar meses).");
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

// Vendedores (Listar para o cadastro)
app.get('/api/vendedores', (req, res) => {
    db.all("SELECT id, nome, login, funcao FROM usuarios WHERE funcao LIKE '%Vendedor%' AND ativo = true", [], (err, rows) => {
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

// Estoque
app.get('/api/estoque', (req, res) => {
    db.all('SELECT * FROM estoque ORDER BY marca, categoria', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar estoque' });
        res.json(rows);
    });
});

// Registrar Nova Venda (Baixa Estoque + Registra em Vendas e Caixa)
app.post('/api/vendas', (req, res) => {
    const { vendedor_id, vendedor_nome, produto_codigo, marca, quantidade, valor_total } = req.body;
    const mes = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 1. Inserir na tabela de Vendas
        db.run(`INSERT INTO vendas (vendedor_id, vendedor_nome, produto_codigo, marca, quantidade, valor_total, mes) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [vendedor_id, vendedor_nome, produto_codigo, marca, quantidade, valor_total, mes]);

        // 2. Baixar do Estoque
        db.run(`UPDATE estoque SET quantidade = quantidade - ? WHERE codigo = ?`, [quantidade, produto_codigo]);

        // 3. Registrar no Caixa (Opcional, mas mantém a movimentação diária real)
        db.run(`INSERT INTO movimentacoes (tipo, valor, descricao) VALUES ('ENTRADA', ?, ?)`, 
                [valor_total, `Venda: ${quantidade}x ${marca} (${produto_codigo}) - Vendedor: ${vendedor_nome}`]);

        db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: 'Erro ao processar venda' });
            res.json({ success: true, message: 'Venda registrada com sucesso!' });
        });
    });
});

// Estatísticas e Relatórios (Métricas por Vendedor, Marca e Comparativo Mensal com Filtros)
app.get('/api/relatorios/vendas', (req, res) => {
    const { data_inicio, data_fim } = req.query;
    let filtro = '';
    let params = [];

    // Monta o filtro de datas dinâmico (Dia, Mês, Ano ou Período Customizado)
    if (data_inicio && data_fim) {
        filtro = ' WHERE date(data) BETWEEN ? AND ? ';
        params = [data_inicio, data_fim];
    }

    const relatorio = {};

    db.serialize(() => {
        // 1. Vendas por Marca (Aplicando o filtro de data)
        db.all(`SELECT marca, SUM(quantidade) as qtd_total, SUM(valor_total) as valor_total FROM vendas ${filtro} GROUP BY marca ORDER BY valor_total DESC`, params, (err, marcas) => {
            relatorio.por_marca = marcas || [];

            // 2. Vendas por Vendedor (Aplicando o filtro de data)
            db.all(`SELECT vendedor_nome, SUM(quantidade) as qtd_total, SUM(valor_total) as valor_total FROM vendas ${filtro} GROUP BY vendedor_nome ORDER BY valor_total DESC`, params, (err, vendedores) => {
                relatorio.por_vendedor = vendedores || [];

                // 3. Comparativo Mensal Global (Sempre mostra o histórico geral para ver o crescimento da empresa)
                db.all('SELECT mes, SUM(valor_total) as total_mes FROM vendas GROUP BY mes ORDER BY mes DESC LIMIT 12', [], (err, meses) => {
                    // Calculando Porcentagem de Crescimento/Queda entre o mês atual e o anterior
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

app.listen(PORT, () => {
    console.log(`🚀 [BANE/NERO] Backend do RF Outlet V2 Rodando na Porta ${PORT} (SQLite Connected)`);
});