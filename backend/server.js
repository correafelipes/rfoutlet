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
        // Tabela de Usuários/Funcionários
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

        // Tabela de Escala
        db.run(`
            CREATE TABLE IF NOT EXISTS escala (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER,
                data TEXT NOT NULL,
                status TEXT NOT NULL
            )
        `);

        console.log('✅ Tabelas criadas (Usuários, Estoque, Caixa, Escala).');

        // Populando dados (Seeding)
        db.get('SELECT COUNT(*) as count FROM usuarios', (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO usuarios (nome, login, senha, funcao, permissoes) VALUES 
                    ('Administrador', 'admin', '123456', 'Gerente Geral', 'TOTAL'),
                    ('Maria (Vendedora)', 'maria', '123', 'Vendedora', 'BASICO'),
                    ('Márcio', 'marcio', '123', 'Estoquista', 'ESTOQUE')
                `);
                console.log('📦 Usuários base criados.');
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
                console.log("📦 Estoque expandido com códigos oficiais (Damyller, TXC, Levi\'s, Lacoste, CK).");
            }
        });
        
        db.get('SELECT COUNT(*) as count FROM movimentacoes', (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO movimentacoes (tipo, valor, descricao) VALUES 
                    ('ENTRADA', 1500.00, 'Abertura de Caixa / Vendas Manhã'),
                    ('SAIDA', 150.00, 'Pagamento fornecedor agua')
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

// Estoque
app.get('/api/estoque', (req, res) => {
    db.all('SELECT * FROM estoque ORDER BY marca, categoria', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar estoque' });
        res.json(rows);
    });
});

// Movimentação Diária
app.get('/api/caixa', (req, res) => {
    db.all('SELECT * FROM movimentacoes ORDER BY data DESC LIMIT 10', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar caixa' });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 [BANE/NERO] Backend do RF Outlet V2 Rodando na Porta ${PORT} (SQLite Connected)`);
});