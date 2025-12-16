const fs = require('fs/promises');
const path = require('path');
const pLimit = require('p-limit').default;
const MAX_CONCURRENT_READS = 20;

// ----------------------------------------------------------------------------------
// --- HELPERS DE LEITURA DE JSON ---
// ----------------------------------------------------------------------------------

/**
 * Lê e analisa um único arquivo JSON. (Replicado do seu helper)
 * @param {string} filePath - O caminho completo para o arquivo JSON.
 * @param {string} filePath - O nome do arquivo JSON.
 */
async function readJsonFile(filePath, fileName) {
    try {
        const rawContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(rawContent);
        return { data: data, jsonFilename: fileName };
    } catch (error) {
        return { error: `ERROR: ${error.message}`, jsonFilename: fileName };
    }
}


/**
 * Lê todos os arquivos JSON de uma pasta usando concorrência (p-limit).
 * @param {string} sourceDir - A pasta contendo arquivos JSON.
 * @returns {Promise<Array<Object>>} Lista de dados JSON analisados e válidos.
 */
async function readAllJsons(sourceDir) {
    const readLimit = pLimit(MAX_CONCURRENT_READS); // Limite de I/O de disco
    
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    const jsonFiles = entries.filter(d => d.isFile() && d.name.endsWith('.json'));

    const readPromises = jsonFiles.map(entry => {
        const sourcePath = path.join(sourceDir, entry.name);
        return readLimit(() => readJsonFile(sourcePath, entry.name));
    });

    // Espera todas as leituras terminarem
    const results = await Promise.all(readPromises);    
    // Retorna apenas os dados válidos, ignorando os que deram erro na leitura/parsing
    return results
        .filter(r => r.data)
        .map(r => r.data);
}

module.exports = {
    readJsonFile, 
    readAllJsons
};