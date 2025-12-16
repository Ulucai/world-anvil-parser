// src/utils/image-registry.js

const fs = require('fs/promises');
const path = require('path');

const REGISTRY_FILENAME = 'img-registry.json';

/**
 * Carrega o registro de imagens existente. Se não existir, retorna um array vazio.
 * @param {string} outputFolder A pasta de saída onde o registro deve estar (ex: ./output).
 * @returns {Promise<Array<Object>>} A lista de metadados de imagens.
 */
async function loadRegistry(outputFolder) {
    const registryPath = path.join(outputFolder, REGISTRY_FILENAME);
    try {
        const data = await fs.readFile(registryPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Image registry file not found at ${registryPath}. Starting fresh.`);
            return []; // Retorna vazio se o arquivo não existir
        }
        console.error("Error loading image registry:", error.message);
        throw error;
    }
}

/**
 * Salva a lista de metadados de imagens no arquivo de registro.
 * @param {string} outputFolder A pasta de saída.
 * @param {Array<Object>} registry A lista atualizada de metadados.
 */
async function saveRegistry(outputFolder, registry) {
    const registryPath = path.join(outputFolder, REGISTRY_FILENAME);
    try {
        await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
        console.log(`Image registry saved to: ${registryPath}`);
    } catch (error) {
        console.error("Error saving image registry:", error.message);
        throw error;
    }
}

/**
 * Escaneia a pasta de saída de imagens, verifica quais itens do registro existem
 * fisicamente e atualiza o status 'extracted: true' no registro em memória.
 * * @param {string} registryOutputFolder A pasta onde o img-registry.json reside (ex: ./output).
 * @param {string} imageDir A pasta onde as imagens .jpg/png estão (ex: ./output/img).
 * @returns {Promise<number>} O número de registros atualizados para 'extracted: true'.
 */
async function synchronizeImageRegistry(registryOutputFolder, imageDir) {
    console.log(`\n--- SINCRONIZAÇÃO DE REGISTRO DE IMAGENS ---`);
    
    // 1. Carrega o registro existente
    let imageRegistry = await loadRegistry(registryOutputFolder);
    
    if (imageRegistry.length === 0) {
        console.log("Registro vazio. Nenhuma sincronização necessária.");
        return 0;
    }

    // 2. Lê a lista de arquivos existentes no disco
    await fs.mkdir(imageDir, { recursive: true }); // Garante que a pasta existe
    const outputEntries = await fs.readdir(imageDir, { withFileTypes: true });
    
    // Cria um Set para pesquisa rápida (apenas nomes de arquivos)
    const existingFilenames = new Set(
        outputEntries
            .filter(d => d.isFile())
            .map(d => d.name)
    );
    console.log(`Arquivos de imagem encontrados no disco: ${existingFilenames.size}`);
    
    let updatesCount = 0;
    
    // 3. Itera sobre o registro e atualiza o status
    for (const item of imageRegistry) {
        if (!item.extracted && existingFilenames.has(item.filename)) {
            // Se o item não estava marcado como extraído, mas o arquivo existe no disco
            item.extracted = true;
            updatesCount++;
        }
    }
    
    // 4. Salva o registro atualizado (se houver mudanças)
    if (updatesCount > 0) {
        await saveRegistry(registryOutputFolder, imageRegistry);
        console.log(`Sincronização concluída. ${updatesCount} itens marcados como 'extracted: true'.`);
    } else {
        console.log("Nenhuma alteração de status necessária no registro.");
    }

    return updatesCount;
}

module.exports = {
    loadRegistry,
    saveRegistry,
    synchronizeImageRegistry
};