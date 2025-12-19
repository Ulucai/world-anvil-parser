const fs = require('fs/promises');
const path = require('path');

/**
 * Carrega o registro existente. Se não existir, retorna um array vazio.
 * @param {string} outputFolder A pasta de saída onde o registro deve estar (ex: ./output).
 * @returns {Promise<Array<Object>>} A lista de metadados de imagens.
 */
async function loadRegistry(outputFolder, registryFilename) {
    const registryPath = path.join(outputFolder, registryFilename);
    try {
        const data = await fs.readFile(registryPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`${registryFilename} não encontrado em ${registryPath}.`);
            return [];
        }
        console.error("Error loading image registry:", error.message);
        throw error;
    }
}

/**
 * Salva a lista de metadados no arquivo de registro.
 * @param {string} outputFolder A pasta de saída.
 * @param {Array<Object>} registry A lista atualizada de metadados.
 */
async function saveRegistry(outputFolder, registry, registryFilename) {
    console.log(`Salvando ${registryFilename}`);
    const registryPath = path.join(outputFolder, registryFilename);
    try {
        await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
        console.log(`${registryFilename} salvo em: ${registryPath}`);
    } catch (error) {
        console.error("Erro ao salvar registry:", error.message);
        throw error;
    }
}

module.exports = {
    loadRegistry,
    saveRegistry
}