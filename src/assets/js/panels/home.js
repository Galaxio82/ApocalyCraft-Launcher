/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')

class Home {
    static id = "home";
    async init(config) {
        this.config = config;
        this.db = new database();
        this.news()
        this.instancesSelect()
        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'))
    }

    async news() {
        let newsElement = document.querySelector('.news-list');
        let news = await config.getNews().then(res => res).catch(err => false);
    
        if (news) {
            if (!news.length) {
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block');
                blockNews.innerHTML = `
                    <div class="news-category">Aucun</div>
                    <div class="news-background">
                        <div class="news-content">
                            <div class="news-title">Aucun news n'est actuellement disponible.</div>
                        </div>
                    </div>
                `;
                newsElement.appendChild(blockNews);
            } else {
                news.sort((a, b) => b.id - a.id);
    
                let latestNews = news.slice(0, 2);
    
                for (let News of latestNews) {
                    let date = this.getdate(News.publish_date);
                    let blockNews = document.createElement('div');
                    blockNews.classList.add('news-block');
                
                    let link = document.createElement('a');
                    link.href = News.linked;
                    link.target = '_blank';
                
                    link.innerHTML = `
                        <div class="news-category">${News.category}</div>
                        <div class="news-background" style="background-image: url(${News.background});">
                            <div class="news-content">
                                <div class="news-title">${News.title}</div>
                                <div class="news-date">${date.day} ${date.month} ${date.year}</div>
                            </div>
                        </div>
                    `;
                
                    blockNews.appendChild(link);
                    newsElement.appendChild(blockNews);
                }
            }
        } else {
            let blockNews = document.createElement('div');
            blockNews.classList.add('news-block');
            blockNews.innerHTML = `
                <div class="news-category">Erreur</div>
                <div class="news-background">
                    <div class="news-content">
                        <div class="news-title">Erreur de chargement</div>
                    </div>
                </div>
            `;
            newsElement.appendChild(blockNews);
        }
    }

    async instancesSelect() {
        let configClient = await this.db.readData('configClient');
        let auth = await this.db.readData('accounts', configClient.account_selected);
        
        let instancesList = await config.getInstanceList();
    
        if (!instancesList || instancesList.length === 0) {
            console.error('Aucune instance trouvée !');
            return;
        }
    
        let instanceSelect = instancesList.find(i => i.name === configClient?.instance_selct) ? configClient?.instance_selct : null;
    
        if (!instanceSelect) {
            let stableInstance = instancesList.find(i => i.name === "stable");
            if (stableInstance) {
                instanceSelect = stableInstance.name;
                configClient.instance_selct = stableInstance.name;
                await this.db.updateData('configClient', configClient);
                setStatus(stableInstance.status);
            }
        }
    
        let instanceSelectElem = document.querySelector('.instance-select');
        let playBtn = document.querySelector('.play-btn');
    
        if (instancesList.length === 1) {
            instanceSelectElem.style.display = 'none';
        }
    
        function updateInstanceSelectOptions() {
            instanceSelectElem.innerHTML = '';
    
            let stableInstance = instancesList.find(i => i.name === "stable");
            if (stableInstance) {
                let option = document.createElement('option');
                option.value = stableInstance.name;
                option.textContent = stableInstance.name;
                option.selected = (stableInstance.name === instanceSelect);
                instanceSelectElem.appendChild(option);
            }
    
            instancesList.forEach(instance => {
                if (instance.name !== "stable") {
                    let option = document.createElement('option');
                    option.value = instance.name;
                    option.textContent = instance.name;
                    if (instance.name === instanceSelect) {
                        option.selected = true;
                    }
                    instanceSelectElem.appendChild(option);
                }
            });
        }
    
        updateInstanceSelectOptions();
    
        instanceSelectElem.addEventListener('change', async (e) => {
            let selectedInstance = e.target.value;
            let configClient = await this.db.readData('configClient');
            configClient.instance_selct = selectedInstance;
            await this.db.updateData('configClient', configClient);
    
            instanceSelect = selectedInstance;
            let selectedInstanceDetails = instancesList.find(i => i.name === instanceSelect);
            setStatus(selectedInstanceDetails.status);
        });
    
        playBtn.addEventListener('click', async () => {
            let configClient = await this.db.readData('configClient');
            let instanceSelect = configClient.instance_selct;
            let auth = await this.db.readData('accounts', configClient.account_selected);
        
            let selectedInstance = instancesList.find(i => i.name === instanceSelect);
            if (selectedInstance && selectedInstance.whitelistActive) {
                if (selectedInstance.whitelist.length === 0) {
                    console.log('Whitelist vide, tout le monde est autorisé.');
                } else {
                    let uuid = auth?.uuid;
                    let isAuthorized = selectedInstance.whitelist.includes(uuid);
                    if (!isAuthorized) {
                        alert('Vous n\'êtes pas autorisé à rejoindre cette instance');
                        return;
                    }
                }
            }
        
            console.log(`Jeu lancé avec l\'instance: ${instanceSelect}`);
            this.startGame();
        });
    }
    
    
    async startGame() {
        let launch = new Launch()
        let configClient = await this.db.readData('configClient')
        let instance = await config.getInstanceList()
        let authenticator = await this.db.readData('accounts', configClient.account_selected)
        let options = instance.find(i => i.name == configClient.instance_selct)

        let infoStartingBOX = document.querySelector('.info-starting-game')
        let infoStarting = document.querySelector(".info-starting-game-text")
        let progressBar = document.querySelector('.progress-bar')

        let opt = {
            url: options.url,
            authenticator: authenticator,
            timeout: 10000,
            path: `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
            instance: options.name,
            version: options.loadder.minecraft_version,
            detached: configClient.launcher_config.closeLauncher == "close-all" ? false : true,
            downloadFileMultiple: configClient.launcher_config.download_multi,
            intelEnabledMac: configClient.launcher_config.intelEnabledMac,
            GAME_ARGS: [
                ...(this.config.autoConnect ? ['--server', options.status.ip, '--port', options.status.port] : [])
            ],
            loader: {
                type: options.loadder.loadder_type,
                build: options.loadder.loadder_version,
                enable: options.loadder.loadder_type == 'none' ? false : true
            },
            verify: options.verify,

            ignored: [...options.ignored],

            javaPath: configClient.java_config.java_path,

            screen: {
                width: configClient.game_config.screen_size.width,
                height: configClient.game_config.screen_size.height
            },

            memory: {
                min: `${configClient.java_config.java_memory.min * 1024}M`,
                max: `${configClient.java_config.java_memory.max * 1024}M`
            }
        }

        launch.Launch(opt);

        infoStartingBOX.style.display = "block"
        progressBar.style.display = "";
        ipcRenderer.send('main-window-progress-load')

        launch.on('extract', extract => {
            ipcRenderer.send('main-window-progress-load')
            console.log(extract);
        });

        launch.on('progress', (progress, size) => {
            infoStarting.innerHTML = `Téléchargement ${((progress / size) * 100).toFixed(0)}%`
            ipcRenderer.send('main-window-progress', { progress, size })
            progressBar.value = progress;
            progressBar.max = size;
        });

        launch.on('check', (progress, size) => {
            infoStarting.innerHTML = `Vérification ${((progress / size) * 100).toFixed(0)}%`
            ipcRenderer.send('main-window-progress', { progress, size })
            progressBar.value = progress;
            progressBar.max = size;
        });

        launch.on('estimated', (time) => {
            let hours = Math.floor(time / 3600);
            let minutes = Math.floor((time - hours * 3600) / 60);
            let seconds = Math.floor(time - hours * 3600 - minutes * 60);
            console.log(`${hours}h ${minutes}m ${seconds}s`);
        })

        launch.on('speed', (speed) => {
            console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
        })

        launch.on('patch', patch => {
            console.log(patch);
            ipcRenderer.send('main-window-progress-load')
            infoStarting.innerHTML = `Patch en cours...`
        });

        launch.on('data', (e) => {
            progressBar.style.display = "none"
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-hide")
            };
            new logger('Minecraft', '#36b030');
            ipcRenderer.send('main-window-progress-load')
            infoStarting.innerHTML = `Demarrage en cours...`
            console.log(e);
        })

        launch.on('close', code => {
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')
            infoStartingBOX.style.display = "none"
            infoStarting.innerHTML = `Vérification`
            new logger(pkg.name, '#7289da');
            console.log('Close');
        });

        launch.on('error', err => {
            let popupError = new popup()

            popupError.openPopup({
                title: 'Erreur',
                content: err.error,
                color: 'red',
                options: true
            })

            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')
            infoStartingBOX.style.display = "none"
            infoStarting.innerHTML = `Vérification`
            new logger(pkg.name, '#7289da');
            console.log(err);
        });
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }
}
export default Home;