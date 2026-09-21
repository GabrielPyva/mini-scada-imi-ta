const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  sendSliderValue: (value) => ipcRenderer.send('slider-value-changed', value)
})
