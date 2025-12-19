const fs = require('fs/promises');
const path = require('path');
const {readAllJsons} = require('./json-utils')
const {loadRegistry, saveRegistry} = require('./registry-utils')


const loreRegistryTemplate = {
    Article: ({id, title, entityClass, cover, url, category, content}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content
        }),
    Person: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Ethnicity: ({id, title, entityClass, cover, url, category, content}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content
        }),
    Category: ({id, title, slug, entityClass, url, articles}) => (
        {
            id,
            title,
            slug,
            entityClass,
            url,
            articles: articles?.map(({id, title, entityClass}) => ({id, title, entityClass}))
        }),
    Formation: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Landmark: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Location: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Organization: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            category: ({id, title, entityClass}) => ({id, title, entityClass}),
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Profession: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Report: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Ritual: ({id, title, entityClass, cover, url, category, content}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content
        }),
    Settlement: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
    Species: ({id, title, entityClass, cover, url, category, content}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content
        }),
    Condition: ({id, title, entityClass, cover, url, category, content, sidepanelcontenttop}) => (
        {
            id,
            title,
            entityClass,
            coverId: cover.id,
            url,
            categoryId: category ? category.id : null,
            categoryTitle: category ? category.title : null,
            content,
            sidepanelcontenttop
        }),
};


function castJson(json) {
    const builder = loreRegistryTemplate[json.entityClass];
    if (!builder) throw new Error(`Unknown entityClass: ${json.entityClass}`);
    return builder(json);
}

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

    //console.log(`\nSincronização completa de registro e disco concluída.`);
}

module.exports = {
    syncLoreRegistry
};