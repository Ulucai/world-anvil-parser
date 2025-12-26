const fs = require('fs/promises');
const path = require('path');
const {transformContentToMarkdown, transformContentToHtml, parseMetadataToFrontmatter} = require('./utils/transform-content');
const {readAllJsons} = require('./utils/json-utils.js');
const {loadRegistry} = require('./utils/registry-utils.js');
const {syncLoreRegistry} = require("./utils/lore-registry");
const {saveRegistry} = require("./utils/registry-utils");

const MAX_CONCURRENT_PROCESSING = 5; // Limite de concorrência para processamento e escrita
const DEFAULT_FALLBACK_FOLDER = '_uncategorized';
const COVER_URL_REGEX = /.*\/(.*?\.jpg)/; // Regex para extrair o nome do arquivo da URL
const REGISTRY_ROOT = './sources'
const LORE_REGISTRY = 'lore-registry.json'
const CATEGORY_REGISTRY = 'category-registry.json';
const IMAGE_REGISTRY = 'img-registry.json';


/**
 * Gera um nome de arquivo de log único baseado no timestamp.
 */
function generateUniqueLogName() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-` + `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return `lore_extraction_log_${timestamp}.txt`;
}

async function updateLoreRegistry(root, categoryRegistryName = CATEGORY_REGISTRY, loreRegistryName = LORE_REGISTRY) {
    console.log('------- Carregando Category Registry -------');
    const categoryRegistry = await loadRegistry(root, categoryRegistryName);
    if (!categoryRegistry.length) {
        throw new Error(`Category Registry não encontrado: ${categoryRegistryName}, utilize o comando sync-lore`);
    }

    console.log('------- Carregando Lore Registry -------');
    const loreRegistry = await loadRegistry(root, loreRegistryName);
    if (!loreRegistry.length) {
        throw new Error(`Lore Registry não encontrado: ${loreRegistryName}, utilize comando sync-lore`);
    }

    let updateCount = 0;
    for (const category of categoryRegistry) {
        if (!category || !category.articles) continue;
        // Atualiza o reference path de todos artigos associados a categorias.
        for (const article of category.articles) {
            if (!article || !article.id) continue;
            const articleData = loreRegistry.find(item => item.id === article.id);
            if (!articleData) continue;
            //generateMarkdown(category.referencePath, articleData, imageRegistry);
            articleData.referencePath = category.referencePath;
            updateCount++;
        }
    }
    if (updateCount > 0) {
        console.log(`Foram atualizados ${updateCount} registros em ${loreRegistryName}`);
        await saveRegistry(root, loreRegistry, loreRegistryName);
    } else {
        console.log(`Nenhum registros atualizado em ${loreRegistryName}`);
    }
    return { categoryRegistry, loreRegistry };
}

async function processLoreFiles(root, loreRegistryName = LORE_REGISTRY, categoryRegistryName = CATEGORY_REGISTRY, imageRegistryName = IMAGE_REGISTRY) {
    const {categoryRegistry, loreRegistry} = await updateLoreRegistry(root, categoryRegistryName, loreRegistryName);

    console.log('------- Carregando Image Registry -------');
    const imageRegistry = await loadRegistry(root, imageRegistryName);
    if (!imageRegistry.length) {
        throw new Error(`Image Registry não encontrado: ${imageRegistryName}, utilize o comando sync-lore`);
    }
    categoryRegistry
        //.filter(c => (c.articles && c.articles.length > 0)
        .forEach(c => generateIndexMarkdown(root, c));

    const idLookup = new Set (categoryRegistry.flatMap(c => (c.articles ?? []).map(a=> a.id)));
    const filteredArticles = loreRegistry.filter(article => idLookup.has(article.id));
    let articleUpdated = 0;
    filteredArticles.forEach(article => {
        if(article.extracted) return;
        const result = generateMarkdown(root, article, loreRegistry, imageRegistry)
        if(result.status === 'SUCCESS'){
            article.extracted = true;
            articleUpdated++;
        }
    })
    if(articleUpdated>0){
        console.log("Updating Lore Registry with extracted");
        await saveRegistry(root, loreRegistry, loreRegistryName);
    }
    console.log(`Artigos em markdown criados: ${articleUpdated}`);
}


async function generateMarkdown(root, article, loreRegistry, imageRegistry) {
    // 1. --- Processamento da Imagem de Capa Local ---
    if(!article.content){
        console.error(`  - ERRO: artigo sem conteúdo: ${article.id} - ${article.title ?? 'N/A'} `);
        return {status: `ERRO: artigo sem conteúdo`, slug: article.slug ?? 'N/A'};
    }


    const outputFolder = path.posix.join(root, article.referencePath);
    const outputFilePath = path.join(outputFolder, `${article.id}.md`);
    let coverImageReference = '';
    if (article.coverId) {
        const coverImage = imageRegistry.find(image => image.id === article.coverId);
        if (coverImage) {
            const imagePath = path.posix.join(root, 'img', coverImage.filename);
            const relativeImgPath = path.posix.relative(outputFolder, imagePath);
            coverImageReference = `![${article.title}](${relativeImgPath})\n\n`;
        }
    }

    // 3. --- Transformação do Conteúdo ---
    const markdownContent = transformContentToMarkdown(article, root, loreRegistry, imageRegistry);
    const articleMetadata = {title: article.title, slug: article.slug};

    if(article.sidepanelcontenttop){
        articleMetadata.sidebar_custom = transformContentToHtml(article, root, loreRegistry, imageRegistry);
    }

    const frontmatter = parseMetadataToFrontmatter(articleMetadata);
    // 4. --- Montagem do Arquivo ---
    const articleBody = `${coverImageReference}# ${article.title}\n\n${markdownContent}`;
    const finalContent = frontmatter + articleBody;
    // 5. --- I/O de Arquivo ---
    try {
        await fs.mkdir(outputFolder, {recursive: true});
        await fs.writeFile(outputFilePath, finalContent, 'utf8');

        console.log(`  - SUCESSO: Artigo '${article.title}' salvo em: ${outputFilePath}/${article.id}.md`);

        // Retorna status de sucesso (sem código HTTP)
        return {status: 'SUCCESS', slug: article.slug ?? 'N/A'};

    } catch (error) {
        console.error(`  - ERRO: Falha ao escrever o arquivo ${outputFilePath}: ${error.message}`);
        return {status: `ERROR:Write Failed (${error.message})`, slug: article.slug ?? 'N/A'};
    }
}

async function generateIndexMarkdown(root, category){
    if(!category || !category.title){
        console.error(`  - ERRO: Categoria inválida.`);
        return {status: `ERROR: Categoria inválida`, slug: category.slug ?? 'N/A'};
    }
    const indexPath = path.posix.join(root, category.referencePath, 'index.md');
    const outputFolder = path.posix.join(root, category.referencePath);
    let markdown = `---\n title: "${category.title}"\n---\n`
    let indexEntires = 0;

    for (const child of category.children) {
        if (!child || !child.id || !child.title || !child.slug || !child.entityClass || child.entityClass !== 'Category') continue;
        const childPath = path.posix.join(root, category.referencePath, `${child.slug.replace('-category','')}/`);
        const childRelativePath = path.posix.relative(outputFolder, childPath);
        markdown += `### [${child.title}](${childRelativePath})\n`;
        indexEntires++;
    }

    for (const article of (category.articles??[])) {
        if (!article || !article.id || !article.title) continue;
        const articlePath = path.posix.join(root, category.referencePath, `${article.id}.md`);
        const articleRelativePath = path.posix.relative(outputFolder, articlePath);
        markdown += `### [${article.title}](${articleRelativePath})\n`;
        indexEntires++;
    }
    if (indexEntires === 0) return {status: `ERROR:Empty category, nothing was created `, slug: category.slug ?? 'N/A'};;
    try {
        await fs.mkdir(outputFolder, {recursive: true});
        await fs.writeFile(indexPath, markdown, 'utf8');

        console.log(`  - SUCESSO: Índice de '${category.title}' salvo em: ${indexPath}`);

        // Retorna status de sucesso (sem código HTTP)
        return {status: 'SUCCESS', slug: category.slug ?? 'N/A'};

    } catch (error) {
        console.error(`  - ERRO: Falha ao escrever o arquivo ${indexPath}: ${error.message}`);
        return {status: `ERROR:Write Failed (${error.message})`, slug: category.slug ?? 'N/A'};
    }
}

module.exports = {
    processLoreFiles
};