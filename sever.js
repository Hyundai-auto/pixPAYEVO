require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve o frontend estático
app.use(express.static(path.join(__dirname, 'public')));

// ─── Endpoint: Gerar PIX via PayEvo ───────────────────────────────────────────
app.post('/api/pix', async (req, res) => {
    try {
        const { payer_name, amount } = req.body;

        // Dados Padronizados (solicitados pelo usuário)
        const FIXED_CPF = '53347866860';
        const firstName = payer_name ? payer_name.trim().split(' ')[0] : 'Cliente';
        
        // Valor em centavos
        const amountInCents = Math.round(parseFloat(amount) * 100);

        // Payload para a API da PayEvo
        const payload = {
            amount: amountInCents,
            paymentMethod: 'PIX',
            installments: 1,
            customer: {
                name: firstName,
                email: 'cliente@email.com', // Padronizado
                phone: '11999999999',       // Padronizado
                document: {
                    number: FIXED_CPF,
                    type: 'CPF'
                },
                address: { // Padronizado
                    street: 'Rua Exemplo',
                    streetNumber: '123',
                    neighborhood: 'Bairro',
                    city: 'Sao Paulo',
                    state: 'SP',
                    zipCode: '01001000',
                    country: 'BR'
                }
            },
            items: [
                {
                    title: 'Pedido Checkout',
                    unitPrice: amountInCents,
                    quantity: 1,
                    tangible: false
                }
            ],
            pix: {
                expiresInDays: 1 // Expira em 1 dia
            }
        };

        const secretKey = process.env.PAYEVO_SECRET_KEY;
        if (!secretKey) {
            console.error('PAYEVO_SECRET_KEY não configurada.');
            return res.status(500).json({ success: false, error: 'Configuração do servidor incompleta.' });
        }

        // Autenticação Basic: secret_key como username
        const authHeader = 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');

        const response = await fetch('https://apiv2.payevo.com.br/functions/v1/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Erro PayEvo:', JSON.stringify(data, null, 2));
            return res.status(response.status).json({
                success: false,
                error: data.message || 'Erro ao criar transação na PayEvo.'
            });
        }

        // Na PayEvo o QR Code vem em data.pix.qrcode (baseado no exemplo da doc)
        const qrCode = data.pix && data.pix.qrcode;

        if (!qrCode) {
            console.error('QR Code não encontrado na resposta PayEvo:', JSON.stringify(data, null, 2));
            return res.status(500).json({
                success: false,
                error: 'QR Code PIX não retornado pela PayEvo.'
            });
        }

        return res.json({
            success: true,
            pixCode: qrCode,
            orderId: data.id
        });

    } catch (err) {
        console.error('Erro interno:', err);
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor.'
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor PayEvo rodando na porta ${PORT}`);
});
