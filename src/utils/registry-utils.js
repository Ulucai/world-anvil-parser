const fs = require('fs/promises');
const {existsSync, mkdirSync} = require('node:fs');
const path = require('path');
const {readAllJsons} = require("./json-utils");

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
    Category: ({id, title, slug, entityClass, url, parent, articles}) => (
        {
            id,
            title,
            slug,
            entityClass,
            url,
            parentId: parent ? parent.id : null,
            parentTitle: parent ? parent.title : null,
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
    builder.referencePath = null;
    return builder(json);
}

/**
 * Cria uma estrutura de árvore baseado id e no parentId para as Categorias
 * @param items
 * @returns {{tree: *[], flatRegistry: any[]}}
 */
function buildRegistryTree(items) {
    const map = Object.fromEntries(items.map(item => [item.id, { ...item, children: [] }]));
    const tree = [];

    const getPath = (node) => {
        if (node.referencePath) return node.referencePath;
        const parent = map[node.parentId];
        // If no parent, path is just the slug; otherwise, join with parent path
        const slug = node.slug.replace('-category','');
        node.referencePath = parent ? path.posix.join(getPath(parent), slug) : slug;
        return node.referencePath;
    };
    Object.values(map).forEach(node => {
        getPath(node); // garante que referencePath está definido
        if (node.parentId && map[node.parentId]) {
            map[node.parentId].children.push(node);
        } else {
            tree.push(node);
        }
    });

    return { tree, flatRegistry: Object.values(map) };
}

/**
 * Cria pastas baseado na árvore de categorias
 * @param flatRegistry
 * @param baseDir
 */
const syncFileSystem = (flatRegistry, baseDir = './output') => {
    flatRegistry.forEach(node => {
        const fullPath = path.join(baseDir, node.referencePath);
        if (!existsSync(fullPath)) {
            mkdirSync(fullPath, { recursive: true });
        }
    });
};

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
    const registryPath = path.posix.join(outputFolder, registryFilename);
    try {
        await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
        console.log(`${registryFilename} salvo em: ${registryPath}`);
    } catch (error) {
        console.error("Erro ao salvar registry:", error.message);
        throw error;
    }
}

function findById(registry, id){
    return registry.find(item => String(item.id) === String(id));
}

module.exports = {
    loadRegistry,
    saveRegistry,
    castJson,
    buildRegistryTree,
    syncFileSystem,
    findById
}