const path = require('path');
const { findById } = require('./registry-utils');
// Regex para encontrar links internos no formato: @[Display Name](entityClass:ID)
// Grupo 2: Display Name
// Grupo 4: entityClass
// Grupo 6: ID
const WA_LINK_REGEX = /(@\[)(.*?)(]\()(.*?)(:)(.*?)(?:\))/g;
const WA_IMG_REGEX = /\[img:(\d+)\]/g;

// Regex para encontrar BBCode de tabela (usaremos para split e parsear)
const WA_TABLE_REGEX = /\[table]([\s\S]*?)\[\/table]/g;

/**
 * Converte links internos do World Anvil (BBCode) para links Markdown locais.
 * Ex: @[Arachne](person:7796f2f2-b029-4b83-9365-f8d5647a0a48)
 * Converte para: [Arachne](../person/7796f2f2-b029-4b83-9365-f8d5647a0a48.md)
 * @param {string} content O conteúdo com links BBCode.
 * @param {string} root O caminho root onde estão os registries.
 * @param {string} articleRefPath A pasta do o artigo md.
 * @param {object} loreRegistry O registry de artigos.
 * @param {object} imageRegistry O registry de imagens.
 * @returns {string} O conteúdo com links Markdown.
 */
function replaceInternalLinks(content, root, articleRefPath, loreRegistry, imageRegistry) {
    content = content.replace(WA_LINK_REGEX, (match, p1, displayName, p3, entityClass, p5, id) => {

        const citedArticle = findById(loreRegistry, id);
        const citedArticlePath = path.posix.join(root, citedArticle.referencePath, `${citedArticle.id}.md`);
        const articlePath = path.posix.join(root, articleRefPath);
        const finalPath = path.posix.relative(articlePath, citedArticlePath);

        return `[${displayName}](${finalPath})`;
    });

    return content.replace(WA_IMG_REGEX, (match, id) => {
        const image = findById(imageRegistry, id);
        if(!image) {
            console.log(`Imagem ${id} não encontrada no registry.`);
            return content;
        }
        const imgFilename = image.filename;
        const imagePath = path.posix.join(root, 'img', imgFilename);
        const articlePath = path.posix.join(root, articleRefPath);
        const finalPath = path.posix.relative(articlePath, imagePath);

        // Retorna o link Markdown: [Display Name](caminho/relativo)
        return `[${image.title??''}](${finalPath})`;
    });
}

/**
 * Converte links internos do World Anvil (BBCode) para links html locais.
 * Ex: @[Arachne](person:7796f2f2-b029-4b83-9365-f8d5647a0a48)
 * Converte para: [Arachne](../person/7796f2f2-b029-4b83-9365-f8d5647a0a48.md)
 * @param {string} content O conteúdo com links BBCode.
 * @param {string} root O caminho root onde estão os registries.
 * @param {string} articleRefPath O caminho do artigo.
 * @param {object} loreRegistry O registry de artigos.
 * @param {object} imageRegistry O registry de imagens.
 * @returns {string} O conteúdo com links Markdown.
 */
function replaceInternalLinksHtml(content, root, articleRefPath, loreRegistry, imageRegistry) {
    content = content.replace(
        WA_LINK_REGEX,
        (match, p1, displayName, p3, entityClass, p5, id) => {
            const citedArticle = findById(loreRegistry, id);
            const citedArticlePath = path.posix.join(root, citedArticle.referencePath, `${citedArticle.id}.md`);
            const articlePath = path.posix.join(root, articleRefPath);
            const finalPath = path.posix.relative(articlePath, citedArticlePath);

            return `<a href="${finalPath}">${displayName}</a>`;
        }
    );
    return content.replace(WA_IMG_REGEX, (match, id) => {
        const imgFilename = findById(imageRegistry, id).filename;
        const imagePath = path.posix.join(root, 'img', imgFilename);
        const articlePath = path.posix.join(root, articleRefPath);
        const finalPath = path.posix.relative(articlePath, imagePath);

        // Retorna o link Markdown: [Display Name](caminho/relativo)
        return `<img src="${finalPath}" alt="">`;
    });
}


/**
 * Converte uma string de BBCode (principalmente para tabelas) em Markdown.
 * Esta é a função mais complexa.
 * @param {string} bbcodeTableContent O conteúdo da tabela (incluindo [tr], [th], [td]).
 * @returns {string} A tabela formatada em Markdown.
 */
function parseBBCodeTable(bbcodeTableContent) {
    // 1. Divide o conteúdo da tabela em linhas ([tr] tags)
    const rows = bbcodeTableContent.split(/\[\/?tr\]/).filter(r => r.trim());

    if (rows.length === 0) return '';

    let markdownTable = '';
    let headerLine = '';
    let alignmentLine = '';
    
    // Processa a primeira linha (assumida como cabeçalho)
    const headerRowContent = rows[0];
    const headers = headerRowContent.split(/\[\/?th\]/).filter(c => c.trim());

    if (headers.length > 0) {
        // 2. Cria a linha de cabeçalho (| H1 | H2 |)
        headerLine = `| ${headers.map(h => h.trim()).join(' | ')} |\n`;

        // 3. Cria a linha de alinhamento (|---|---|)
        alignmentLine = `| ${headers.map(() => '---').join(' | ')} |\n`;
        
        markdownTable += headerLine + alignmentLine;
    }
    
    // 4. Processa as linhas de dados restantes ([td] tags)
    const dataRows = rows.slice(1);
    
    for (const rowContent of dataRows) {
        const cells = rowContent.split(/\[\/?td\]/).filter(c => c.trim());
        if (cells.length > 0) {
            markdownTable += `| ${cells.map(c => c.trim()).join(' | ')} |\n`;
        }
    }

    return markdownTable;
}

/**
 * Função principal para converter o conteúdo BBCode para Markdown.
 * @param {object} article O artigo.
 * @param {string} root O caminho root onde estão os registries.
 * @param {object} loreRegistry O registry de artigos.
 * @param {object} imageRegistry O registry de imagens.
 * @returns {string} O conteúdo Markdown transformado.
 */
function transformContentToMarkdown(article, root, loreRegistry, imageRegistry) {
    let markdown = article.content;
    if (!markdown){
        console.log("Markdown not found", "Article", article);
        throw new Error("Falha, ao recuperar contéudo do artigo.");
    }
    const articleReferencePath = article.referencePath

    // A. 1. Processa as tabelas primeiro (substituindo o bloco [table] inteiro)
    markdown = markdown.replace(WA_TABLE_REGEX, (match) => {
        return parseBBCodeTable(match);
    });
    
    // B. 2. Substitui links internos
    markdown = replaceInternalLinks(markdown, root, articleReferencePath, loreRegistry, imageRegistry);

    // C. 3. Substitui outros BBCode simples (headers e bold)
    markdown = markdown
        .replace(/\[h1\]/g, '# ')
        .replace(/\[\/h1\]/g, '')
        .replace(/\[h2\]/g, '## ')
        .replace(/\[\/h2\]/g, '')
        .replace(/\[h3\]/g, '### ')
        .replace(/\[\/h3\]/g, '')
        .replace(/\[h4\]/g, '#### ')
        .replace(/\[\/h4\]/g, '')
        .replace(/\[h5\]/g, '##### ')
        .replace(/\[\/h5\]/g, '')
        .replace(/\[h6\]/g, '###### ')
        .replace(/\[\/h6\]/g, '')
        .replace(/\[b\]/g, '**')
        .replace(/\[\/b\]/g, '**')
        .replace(/\[ul\]/g, '')
        .replace(/\[\/ul\]/g, '')
        .replace(/\[li\]/g, '* ')
        .replace(/\[\/li\]/g, '')
        .replace(/\[br\]/g, '<br>')
        .replace(/\[hr\]/g, '\n---\n');

    // D. 4. Limpa quebras de linha/retorno de carro desnecessárias
    markdown = markdown.replace(/\r\n/g, '\n'); 

    return markdown;
}

/**
 * Converte um objeto de metadados em uma string YAML Frontmatter.
 * * O Frontmatter deve ter o seguinte formato:
 * ---
 * title: "My Title"
 * tags: "tag1, tag2, tag3"
 * ---
 * * @param {object} metadata O objeto contendo as chaves e valores de metadados.
 * @returns {string} A string formatada como YAML Frontmatter.
 */
function parseMetadataToFrontmatter(metadata) {
    if (!metadata || typeof metadata !== 'object') {
        return '';
    }

    let frontmatter = '---\n';

    // Itera sobre as chaves e valores do objeto de metadados
    for (const key in metadata) {
        if (Object.hasOwnProperty.call(metadata, key)) {
            let value = metadata[key];
            
            // Tratamento: Garante que o valor seja uma string.
            if (typeof value !== 'string') {
                value = String(value);
            }

            // Tratamento: Coloca o valor entre aspas duplas, seguindo a convenção YAML para strings.
            // Ex: title: "My Title"
            frontmatter += `${key}: "${value}"\n`;
        }
    }

    frontmatter += '---\n\n';

    return frontmatter;
}

/**
 * Função principal para converter o conteúdo BBCode para HTML.
 * @param {object} article O artigo.
 * @param {string} root O caminho root onde estão os registries.
 * @param {object} loreRegistry O registry de artigos.
 * @param {object} imageRegistry O registry de imagens.
 * @returns {string} O conteúdo HTML transformado.
 */
function transformContentToHtml(article, root, loreRegistry, imageRegistry) {
    let html = article.sidepanelcontenttop;
    const articleReferencePath = article.referencePath
    if (!html){
        throw new Error("Falha, ao recuperar conteúdo do sidepanel do artigo.");
    }

    // Normalize line breaks
    html = html.replace(/\r\n/g, '\n');



    html = replaceInternalLinksHtml(html, root, articleReferencePath, loreRegistry, imageRegistry);
    // Headings
    html = html
        .replace(/\[h1\](.*?)\[\/h1\]/gs, '<h1>$1</h1>')
        .replace(/\[h2\](.*?)\[\/h2\]/gs, '<h2>$1</h2>')
        .replace(/\[h3\](.*?)\[\/h3\]/gs, '<h3>$1</h3>')
        .replace(/\[h4\](.*?)\[\/h4\]/gs, '<h4>$1</h4>')
        .replace(/\[h5\](.*?)\[\/h5\]/gs, '<h5>$1</h5>')
        .replace(/\[h6\](.*?)\[\/h6\]/gs, '<h6>$1</h6>');

    // Center
    html = html.replace(
        /\[center\](.*?)\[\/center\]/gs,
        '<div style="text-align:center;">$1</div>'
    );

    // Bold
    html = html.replace(/\[b\](.*?)\[\/b\]/gs, '<strong>$1</strong>');

    // Horizontal rule
    html = html.replace(/\[hr\]/g, '<hr>');

    // Lists
    html = html
        .replace(/\[ul\]/g, '<ul>')
        .replace(/\[\/ul\]/g, '</ul>')
        .replace(/\[li\]/g, '<li>')
        .replace(/\[\/li\]/g, '</li>');

    // Line breaks
    html = html.replace(/\n{2,}/g, '<br><br>');

    return html.trim();
}

module.exports = {
    transformContentToMarkdown,
    replaceInternalLinks, // Exportar para testes se necessário
    parseBBCodeTable, // Exportar para testes se necessário
    parseMetadataToFrontmatter,
    transformContentToHtml
};