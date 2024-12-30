const { ipcRenderer, shell } = require('electron');
const pkg = require('../package.json');
const os = require('os');
import { config, database } from './utils.js';
const nodeFetch = require("node-fetch");


class Splash {
    constructor() {
        this.splash = document.querySelector(".splash");
        this.splashMessage = document.querySelector(".splash-message");
        this.splashAuthor = document.querySelector(".splash-author");
        this.message = document.querySelector(".message");
        this.progress = document.querySelector(".progress");
        document.addEventListener('DOMContentLoaded', async () => {
            let databaseLauncher = new database();
            let configClient = await databaseLauncher.readData('configClient');
            let theme = configClient?.launcher_config?.theme || "auto"
            let isDarkTheme = await ipcRenderer.invoke('is-dark-theme', theme).then(res => res)
            document.body.className = isDarkTheme ? 'dark global' : 'light global';
            if (process.platform == 'win32') ipcRenderer.send('update-window-progress-load')
            this.startAnimation()
        });
    }

    async startAnimation() {
        let splashes = [
            { "message": "Je... vie...", "author": "Luuxis" },
            { "message": "Salut je suis du code.", "author": "Luuxis" },
            { "message": "Linux n'est pas un os, mais un kernel.", "author": "Luuxis" }
        ];
        let splash = splashes[Math.floor(Math.random() * splashes.length)];
        this.splashMessage.textContent = splash.message;
        this.splashAuthor.children[0].textContent = "@" + splash.author;
        await sleep(100);
        document.querySelector("#splash").style.display = "block";
        await sleep(500);
        this.splash.classList.add("opacity");
        await sleep(500);
        this.splash.classList.add("translate");
        this.splashMessage.classList.add("opacity");
        this.splashAuthor.classList.add("opacity");
        this.message.classList.add("opacity");
        await sleep(1000);
        this.checkUpdate();
    }

    async checkUpdate() {
        this.setStatus(`Recherche de mise à jour...`);

        ipcRenderer.invoke('update-app').then().catch(err => {
            return this.shutdown(`erreur lors de la recherche de mise à jour :<br>${err.message}`);
        });

        ipcRenderer.on('updateAvailable', () => {
            this.setStatus(`Mise à jour disponible !`);
            if (os.platform() == 'win32') {
                this.toggleProgress();
                ipcRenderer.send('start-update');
            }
            else return this.downloadUpdate();
        })

        ipcRenderer.on('error', (event, err) => {
            if (err) return this.shutdown(`${err.message}`);
        })

        ipcRenderer.on('download-progress', (event, progress) => {
            console.log("cc2")
            ipcRenderer.send('update-window-progress', { progress: progress.transferred, size: progress.total })
            this.setProgress(progress.transferred, progress.total);
        })

        ipcRenderer.on('update-not-available', () => {
            console.log("cc3")
            console.error("Mise à jour non disponible");
            this.maintenanceCheck();
        })
    }
    
    async downloadUpdate() {
        const updateInfoURL = `${pkg.url}/updates/update_config.json`;
        
        try {
            const updateInfo = await nodeFetch(updateInfoURL).then(res => res.json()).catch(err => {
                console.error('Erreur lors de la récupération des informations de mise à jour:', err);
                return null;
            });
    
            if (!updateInfo) {
                console.error('Aucune information de mise à jour disponible.');
                return;
            }
    
            const latestVersion = updateInfo.version;
            const currentVersion = pkg.version;
    
            if (currentVersion >= latestVersion) {
                console.log('Aucune mise à jour nécessaire.');
                return;
            }
    
            let downloadUrl;
            if (os.platform() === 'darwin') {
                downloadUrl = updateInfo.os.darwin;
            } else if (os.platform() === 'linux') {
                downloadUrl = updateInfo.os.linux;
            } else {
                console.error('Système d\'exploitation non pris en charge.');
                return;
            }
    
            this.setStatus(`Mise à jour disponible !<br><div class="download-update">Télécharger</div>`);
    
            document.querySelector('.download-update').addEventListener('click', () => {
                shell.openExternal(downloadUrl);
                return this.shutdown('Téléchargement en cours...');
            });
    
        } catch (error) {
            console.error('Erreur lors du processus de mise à jour:', error);
        }
    }
      

    async maintenanceCheck() {
        config.GetConfig().then(res => {
            console.log(res)
            if (res.maintenance) return this.shutdown(res.maintenance_message);
            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("Aucune connexion internet détectée,<br>veuillez réessayer ultérieurement.");
        })
    }

    startLauncher() {
        this.setStatus(`Démarrage du launcher`);
        ipcRenderer.send('main-window-open');
        ipcRenderer.send('update-window-close');
    }

    shutdown(text) {
        this.setStatus(`${text}<br>Arrêt dans 5s`);
        let i = 4;
        setInterval(() => {
            this.setStatus(`${text}<br>Arrêt dans ${i--}s`);
            if (i < 0) ipcRenderer.send('update-window-close');
        }, 1000);
    }

    setStatus(text) {
        this.message.innerHTML = text;
    }

    toggleProgress() {
        if (this.progress.classList.toggle("show")) this.setProgress(0, 1);
    }

    setProgress(value, max) {
        this.progress.value = value;
        this.progress.max = max;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
        ipcRenderer.send("update-window-dev-tools");
    }
})
new Splash();