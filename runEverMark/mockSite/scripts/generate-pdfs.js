
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Ensure public dir exists
const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// Random Data Generation
const clients = ['Northwind Travel', 'Nova Foods', 'Atlas Retail', 'Tech Solutions', 'Omega Corp'];
const products = [
    { name: 'Laptop Pro', price: 1200 },
    { name: 'Desk Chair', price: 350 },
    { name: 'Keyboard', price: 80 },
];

const selectedClient = 'Northwind Travel';
const orderItems = [];
for (let i = 0; i < 3; i++) {
    const prod = products[i];
    orderItems.push({
        ...prod,
        quantity: Math.floor(Math.random() * 5) + 1
    });
}
const total = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

const orderId = `PO-${Math.floor(1000 + Math.random() * 9000)}`;
const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// --- GENERATE ORDER FORM (Client Header) ---
const docOrder = new PDFDocument();

try {
    const stream = fs.createWriteStream(path.join(publicDir, 'order_form.pdf'));
    stream.on('error', (e) => console.warn('Write error for order form:', e.message));
    docOrder.pipe(stream);
} catch (e) {
    console.warn('Sync error creating stream:', e.message);
}

// Client Header
docOrder.fontSize(20).text(selectedClient, 50, 50);
docOrder.fontSize(10).text('123 Client St\nBusiness City, ST 12345\nPhone: 555-0100\ncontact@client.com', 50, 75);

// Title
docOrder.fontSize(25).fillColor('#0176d3').text('PURCHASE ORDER', 300, 50, { align: 'right' });
docOrder.fontSize(12).fillColor('black').text(`Order #: ${orderId}`, 300, 80, { align: 'right' });
docOrder.text(`Date: ${date}`, 300, 95, { align: 'right' });

// Vendor Info
docOrder.text('Vendor:\nSalesForce POS System\n123 Cloud Way\nSan Francisco, CA 94105', 300, 120, { align: 'right' });



// Items
let y = 200;
docOrder.fontSize(12).font('Helvetica-Bold');
docOrder.text('Item', 50, y);
docOrder.text('Qty', 300, y);
docOrder.text('Price', 360, y, { width: 80, align: 'right' });
docOrder.text('Total', 460, y, { width: 90, align: 'right' });
docOrder.moveTo(50, y + 15).lineTo(550, y + 15).stroke();

y += 30;
docOrder.font('Helvetica');
orderItems.forEach(item => {
    const lineTotal = item.price * item.quantity;
    docOrder.text(item.name, 50, y);
    docOrder.text(item.quantity.toString(), 300, y);
    docOrder.text(`$${item.price.toFixed(2)}`, 360, y, { width: 80, align: 'right' });
    docOrder.text(`$${lineTotal.toFixed(2)}`, 460, y, { width: 90, align: 'right' });
    y += 20;
});

// Total
y += 20;
docOrder.font('Helvetica-Bold').fontSize(14);
docOrder.text(`Total: $${total.toFixed(2)}`, 400, y, { width: 150, align: 'right' });

y += 20;
docOrder.fillColor('red').font('Helvetica-Bold').fontSize(10);
docOrder.text('Remarks: We are not open on monday, please do not delivery on monday', 300, y, { align: 'right', width: 250 });
docOrder.end();


// --- GENERATE INVOICE (Host Header) ---
const docInvoice = new PDFDocument();

try {
    const stream = fs.createWriteStream(path.join(publicDir, 'invoice.pdf'));
    stream.on('error', (e) => console.warn('Write error for invoice:', e.message));
    docInvoice.pipe(stream);
} catch (e) {
    console.warn('Sync error creating stream:', e.message);
}

// Host Header
docInvoice.fontSize(20).fillColor('#0176d3').text('INVOICE', 400, 50, { align: 'right' });
docInvoice.fontSize(14).fillColor('black').text('SalesForce POS System', 50, 50);
docInvoice.fontSize(10).text('123 Cloud Way\nSan Francisco, CA 94105\nsupport@salesforcepos.com', 50, 70);

// Bill To (Client)
docInvoice.text('Bill To:', 50, 140);
docInvoice.fontSize(12).font('Helvetica-Bold').text(selectedClient, 50, 155);
docInvoice.font('Helvetica').fontSize(10).text('123 Client St\nBusiness City, ST 12345', 50, 170);

// Info
docInvoice.text(`Invoice #: INV-${orderId}`, 400, 140, { align: 'right' });
docInvoice.text(`Date: ${date}`, 400, 155, { align: 'right' });

// Items
y = 220;
// Background strip
docInvoice.rect(50, y - 5, 500, 20).fill('#f3f2f2');
docInvoice.fillColor('black');

docInvoice.fontSize(12).font('Helvetica-Bold');
docInvoice.text('Description', 60, y);
docInvoice.text('Amount', 450, y, { width: 100, align: 'right' });

y += 30;
docInvoice.font('Helvetica');
// Summary line as per request or itemized? "share same products"
// I will list items to be precise.
orderItems.forEach(item => {
    const lineTotal = item.price * item.quantity;
    docInvoice.text(`${item.name} (x${item.quantity})`, 60, y);
    docInvoice.text(`$${lineTotal.toFixed(2)}`, 450, y, { width: 100, align: 'right' });
    y += 20;
});

// Total
y += 20;
docInvoice.moveTo(350, y).lineTo(550, y).stroke();
y += 10;
docInvoice.font('Helvetica-Bold').fontSize(14);
docInvoice.text(`TOTAL DUE: $${total.toFixed(2)}`, 400, y, { width: 150, align: 'right' });

docInvoice.end();

console.log('PDFs generated in public/ folder.');
