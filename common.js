const path = require('path');
const { fs, util, log } = require('vortex-api');
const winapi = require('winapi-bindings');

// Commonly used IDs/variables
const MOD_FILE_EXT = ".ini";
const GAME_ID = 'genshinimpact';
const EPIC_ID = '41869934302e4b8cafac2d3c0e7c293d';
const GIMI_PATH = path.join(util.getVortexPath('localAppData'), 'GenshinImpactMods');
const GIMI_MODS_PATH = path.join(GIMI_PATH, '3dmigoto', 'Mods');
const GIMI_LOADER = '3DMigoto Loader.exe';

async function findLauncher() {
    // To find where the game is installed we first need to find the launcher. It will either be installed via EGS or manually. 
    try {
        // Check EGS
        const epic = await util.GameStoreHelper.findByAppId([EPIC_ID]);
        return epic;
    }
    catch(err) {
        // Check for the standalone launcher
        log('debug', 'Genshin Impact not found on Epic, checking for it\'s own launcher');
        const instPathLauncher = winapi.RegGetValue(
        'HKEY_LOCAL_MACHINE',
        'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Genshin Impact',
        'InstallPath');
        if (!instPathLauncher) return;
        else return { gamePath: instPathLauncher.value };
    }
}
  
async function findGame() {
    // To find where the game is installed we first need to find the launcher. It will either be installed via EGS or manually. 
    const launcherPath = await findLauncher();
    if (!launcherPath) return;

    // Now we know where the launcher is we need to look at the config.ini to find the actual game.
    const launcherConfig = path.join(launcherPat.gamePath , 'config.ini');
    try {
        const configData = await fs.readFileAsync(launcherConfig, { encoding: 'utf8' });
        const installPath = configData.split(`\n`)
        .find(r => r.toLowerCase().startsWith('game_install_path'));
        if (!installPath) throw new Error('game_install_path missing from Genshin Launcher config.ini');
        const gameFolder = installPath.replace('game_install_path=', '').trim();
        return gameFolder;
    }
    catch(err2) {
        log('warn', 'Error locating Genshin Impact', err2);
        return;
    }

}

module.exports = { MOD_FILE_EXT, GAME_ID, EPIC_ID, GIMI_PATH, GIMI_MODS_PATH, GIMI_LOADER, findGame, findLauncher };
