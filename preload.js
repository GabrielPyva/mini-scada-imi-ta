const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  connectModbus: (host) => ipcRenderer.send('modbus-connect-requested', host),
  sendSliderValue: (value) => ipcRenderer.send('slider-value-changed', value),
  writeRegister122: (value) => ipcRenderer.send('register-122-value-changed', value),
  onConnectionStatusUpdated: (callback) => {
    ipcRenderer.on('connection-status-updated', (_event, status) => callback(status))
  },
  onMeasuredValuesUpdated: (callback) => {
    ipcRenderer.on('measured-values-updated', (_event, values) => callback(values))
  }
})
