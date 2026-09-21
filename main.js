const { app, BrowserWindow, ipcMain } = require('electron')
const Modbus = require('jsmodbus')
const net = require('net')
const path = require('path')

const MODBUS_HOST = '192.168.2.49'
const MODBUS_PORT = 502
const UNIT_ID = 1
const SCAN_RATE = 1000
const START_ADDRESS = 302

const socket = new net.Socket()
const client = new Modbus.client.TCP(socket, UNIT_ID)
let pendingValue = 0

function valueToRegisters (value) {
  const buffer = Buffer.allocUnsafe(4)
  buffer.writeFloatBE(Number(value), 0)

  return [buffer.readUInt16BE(0), buffer.readUInt16BE(2)]
}

function writeSliderValue () {
  if (client.connectionState !== 'online') return

  client.writeMultipleRegisters(START_ADDRESS, valueToRegisters(pendingValue))
    .catch((error) => console.error('Modbus write failed:', error.message))
}

function connectModbus () {
  socket.on('connect', () => {
    console.log(`Connected to Modbus TCP ${MODBUS_HOST}:${MODBUS_PORT}`)
    writeSliderValue()
  })

  socket.on('error', (error) => {
    console.error('Modbus TCP connection failed:', error.message)
  })

  socket.connect({ host: MODBUS_HOST, port: MODBUS_PORT })
  setInterval(writeSliderValue, SCAN_RATE)
}

ipcMain.on('slider-value-changed', (_event, value) => {
  pendingValue = Number(value)
  writeSliderValue()
})

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  connectModbus()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
