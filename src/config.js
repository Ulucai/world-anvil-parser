const fs = require('fs/promises');
const path = require('path');

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

const DEFAULT_CONFIG = {  
  outputFolder: './output', 
  //TODO add additional keys
};

/**
 * Ensures the config file exists, creates it with defaults if not, 
 * reads it, and returns the parsed object.
 * @returns {Promise<object>} The application configuration object.
 */
async function loadConfig() {
  try {    
    await fs.access(CONFIG_FILE);    
    
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const userConfig = JSON.parse(data);    
    
    return { ...DEFAULT_CONFIG, ...userConfig };        
  } catch (error) {
    
    if (error.code === 'ENOENT') {
      console.log(`\nConfiguration file not found. Creating default: ${CONFIG_FILE}`);
            
      await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));            
      return DEFAULT_CONFIG;
    }
    
    
    console.error("Error loading or creating configuration file:", error.message);
    throw error;
  }
}

module.exports = {
  loadConfig,  
  DEFAULT_CONFIG 
};