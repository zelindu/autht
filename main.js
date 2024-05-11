const puppeteer = require('puppeteer-extra');
const readlineSync = require('readline-sync');
const fs = require('fs');
const ExcelJS = require('exceljs');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const WebSocket = require('websocket').w3cwebsocket;

(async () => {
  puppeteer.use(StealthPlugin());

  const url = readlineSync.question('Masukkan URL: ');
  const numTabs = parseInt(readlineSync.question('Masukkan jumlah tab: '));

  const browser = await puppeteer.launch({ headless: true, executablePath: '/home/codespace/.cache/puppeteer/chrome/linux-124.0.6367.78/chrome-linux64/chrome' }); 
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data');

  worksheet.columns = [
    { header: 'WebSocket URL', key: 'webSocketUrl' },
    { header: 'Sec-WebSocket-Protocol', key: 'secWebSocketProtocol' }
  ];

  for (let i = 0; i < numTabs; i++) {
    console.log(`Membuka tab ${i + 1} dari ${numTabs}`);

    const page = await browser.newPage();

    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    const data = [];

    client.on('Network.webSocketCreated', ({ requestId, url }) => {
      console.log('WebSocket URL:', url);
      data.push({ webSocketUrl: url });
    });

    client.on('Network.webSocketWillSendHandshakeRequest', ({ requestId, request }) => {
      console.log('Sec-WebSocket-Protocol:', request.headers['Sec-WebSocket-Protocol']);
      data[data.length - 1].secWebSocketProtocol = request.headers['Sec-WebSocket-Protocol'];
    });

    await page.goto(url);
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      await page.waitForSelector('.m-LiveList-CardTips');
      await page.click('.m-LiveList-CardTips');
      console.log('Element clicked successfully.');
    } catch (error) {
      await page.evaluate(() => {
        const element = document.querySelector('.live-tag');
        if (element) {
          element.click();
          console.log('Element .live-tag clicked successfully using JavaScript.');
        } else {
          console.error('Element .live-tag not found in the DOM.');
        }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    data.forEach(row => {
      worksheet.addRow(row);
    });

    await page.close();
  }

  console.log(`Proses selesai. Menutup browser...`);
  await browser.close();

  const fileName = 'data_tab.xlsx';
  await workbook.xlsx.writeFile(fileName);

  console.log(`Data disimpan dalam file Excel dengan nama ${fileName}.`);

  const excelFilePath = 'data_tab.xlsx';
  const delayBetweenConnections = 2; // Jeda 5 detik
  readExcelAndConnect(excelFilePath, delayBetweenConnections);
})();

function readExcelAndConnect(filePath, delayBetweenConnections) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const connections = data.slice(1);

    connections.forEach((connection, index) => {
      const [wsUrl, protocol] = connection;

      if (typeof protocol === 'string' && protocol.trim() !== '') {
        const cleanProtocolList = protocol.replace(/\s/g, '').split(',').filter(p => p !== '');

        const connectWebSocket = () => {
          try {
            const ws = new WebSocket(wsUrl, cleanProtocolList);

            ws.onopen = () => {
              console.log(`Connected to WebSocket at ${wsUrl}`);
            };

            ws.onmessage = (event) => {
              console.log(`Received: ${event.data}`);
            };

            ws.onerror = (error) => {
              console.error(`WebSocket error: ${error}`);
            };

            ws.onclose = () => {
              console.log('WebSocket connection closed');
              setTimeout(connectWebSocket, delayBetweenConnections * 1000);
            };
          } catch (error) {
            console.error(`Error creating WebSocket connection: ${error}`);
          }
        };

        setTimeout(connectWebSocket, index * delayBetweenConnections * 1000);
      } else {
        console.warn(`Warning: Protocol is missing or invalid for connection at row ${index + 2}`);
      }
    });
  } catch (error) {
    console.error(`Error reading Excel file: ${error.message}`);
  }
}
