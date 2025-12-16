const path = require('path');

// Regex para encontrar links internos no formato: @[Display Name](entityClass:ID)
// Grupo 2: Display Name
// Grupo 4: entityClass
// Grupo 6: ID
const WA_LINK_REGEX = /(@\[)(.*?)(]\()(.*?)(:)(.*?)(?:\))/g;

// Regex para encontrar BBCode de tabela (usaremos para split e parsear)
const WA_TABLE_REGEX = /\[table]([\s\S]*?)\[\/table]/g;

/**
 * Converte links internos do World Anvil (BBCode) para links Markdown locais.
 * Ex: @[Arachne](person:7796f2f2-b029-4b83-9365-f8d5647a0a48)
 * Converte para: [Arachne](../person/7796f2f2-b029-4b83-9365-f8d5647a0a48.md)
 * @param {string} content O conteúdo com links BBCode.
 * @returns {string} O conteúdo com links Markdown.
 */
function replaceInternalLinks(content) {
    return content.replace(WA_LINK_REGEX, (match, p1, displayName, p3, entityClass, p5, id) => {
        // Usamos path.join para garantir o separador correto, 
        // mas precisamos de caminhos relativos para funcionar no Markdown
        
        // Caminho relativo: '../[entityClass]/[ID].md'
        const relativePath = path.join('..', entityClass, `${id}.md`).replace(/\\/g, '/'); 

        // Retorna o link Markdown: [Display Name](caminho/relativo)
        return `[${displayName}](${relativePath})`;
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
 * @param {string} content O conteúdo raw BBCode.
 * @returns {string} O conteúdo Markdown transformado.
 */
function transformContentToMarkdown(content) {
    let markdown = content;

    // A. 1. Processa as tabelas primeiro (substituindo o bloco [table] inteiro)
    markdown = markdown.replace(WA_TABLE_REGEX, (match) => {
        return parseBBCodeTable(match);
    });
    
    // B. 2. Substitui links internos
    markdown = replaceInternalLinks(markdown);

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

module.exports = {
    transformContentToMarkdown,
    replaceInternalLinks, // Exportar para testes se necessário
    parseBBCodeTable, // Exportar para testes se necessário
    parseMetadataToFrontmatter,
};