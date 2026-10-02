const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  sendSliderValue: (value) => ipcRenderer.send('slider-value-changed', value),
  writeRegister122: (value) => ipcRenderer.send('register-122-value-changed', value),
  onMeasuredValuesUpdated: (callback) => {
    ipcRenderer.on('measured-values-updated', (_event, values) => callback(values))
  }
})
