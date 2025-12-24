const fs = require('fs/promises');
const path = require('path');
const {readAllJsons} = require('./json-utils')
const {castJson, loadRegistry, saveRegistry, buildRegistryTree, syncFileSystem} = require('./registry-utils')

/**
 * Rastreia os arquivos JSON de origem e garante que todos os metadados
 * estejam presentes no registro (criação de novas entradas).
 * @param {string} sourceDir A pasta contendo os arquivos JSON de origem.
 * @param {string} registryOutputFolder A pasta onde o lore-registry.json reside (ex: ./output).
 * @returns {Promise<Array<Object>>} O registro de lore com todas as entradas JSON.
 */
async function buildRegistryFromJsons(sourceDir, registryOutputFolder, registryFilename) {
    console.log(`\n--- RASTREAMENTO DE JSONS PARA REGISTRO DE LORE ---`);
    if (!sourceDir || !registryOutputFolder || !registryFilename)
        throw new Error(`Faltam parâmetros obrigatórios: ${sourceDir?'':'sourceDir'} ${registryOutputFolder?'':'registryOutputFolder'} ${registryFilename?'':'registryFilename'}`);
    // 1. Carrega o registro existente
    let baseRegistry = await loadRegistry(registryOutputFolder, registryFilename);
    const parsedJsonData = await readAllJsons(sourceDir);

    let newItemsAdded = 0;

    for (const jsonData of parsedJsonData) {
        if (!jsonData) continue;
        try{
            data = castJson(jsonData);
        }catch(e){
            console.log("falha na classe",jsonData.entityClass);
            console.log("Url:",jsonData.url);
            console.error("Falhou no cast"+e);
        }


        // Apenas processa se houver um ID
        if (!data.id || !data.entityClass || !data.url) {
            continue;
        }

        // Tenta encontrar o item no registro pelo ID (fonte de verdade)
        let registryItem = baseRegistry.find(item => item.id === data.id);
        if (!registryItem) {
            // Se não existe, cria uma nova entrada
            registryItem = {
                ...data,
                extracted: false, // Novo item é sempre 'false'
            };
            baseRegistry.push(registryItem);
            newItemsAdded++;
        }
    }
    let flatRegistry;
    if(baseRegistry.every(r=>r.entityClass==='Category')){
        const {flatRegistry} = buildRegistryTree(baseRegistry);
        syncFileSystem(flatRegistry);
        baseRegistry = flatRegistry;
    }

    if (newItemsAdded > 0) {
        await saveRegistry(registryOutputFolder, baseRegistry, registryFilename);
        console.log(`Rastreamento de JSON concluído. Adicionadas ${newItemsAdded} novas entradas. Total: ${baseRegistry.length}`);
    } else {
        console.log("Nenhuma nova entrada adicionada ao registro.");
    }
    return baseRegistry;
}

/**
 *
 * @param sourceDir {string}
 * @param registryOutputFolder {string}
 * @param registryFilename {string}
 * @returns {Promise<void>}
 */
async function syncLoreRegistry(sourceDir, registryOutputFolder, registryFilename){
    // 1. RASTREAMENTO: Garante que todos os metadados JSON estejam no registro
    // O registro é criado/atualizado com as entradas do JSON, todas marcadas como 'extracted: false'
    const updatedRegistry = await buildRegistryFromJsons(sourceDir, registryOutputFolder, registryFilename);
    // 2. SINCRONIZAÇÃO DE STATUS: Verifica o disco e atualiza o status 'extracted: true'
    //await synchronizeDiskStatus(registryOutputFolder, loreRootDir, updatedRegistry);
    return updatedRegistry;
    //console.log(`\nSincronização completa de registro e disco concluída.`);
}

module.exports = {
    syncLoreRegistry
};