const fs = require('fs/promises');
const path = require('path');

/**
 * Carrega o registro existente. Se não existir, retorna um array vazio.
 * @param {string} outputFolder A pasta de saída onde o registro deve estar (ex: ./output).
 * @returns {Promise<Array<Object>>} A lista de metadados de imagens.
 */
async function loadRegistry(outputFolder, registry_filename) {
    const registryPath = path.join(outputFolder, registry_filename);
    try {
        const data = await fs.readFile(registryPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`${registry_filename} não encontrado em ${registryPath}.`);
            return []; // Retorna vazio se o arquivo não existir
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
async function saveRegistry(outputFolder, registry, registry_filename) {
    const registryPath = path.join(outputFolder, registry_filename);
    try {
        await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
        console.log(`${registry_filename} salvo em: ${registryPath}`);
    } catch (error) {
        console.error("Erro ao salvar registry:", error.message);
        throw error;
    }
}

module.exports = {
    loadRegistry,
    saveRegistry
}