const fs = require('fs/promises');
const path = require('path');
const { readAllJsons } = require('./json-utils')
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
            console.log(`Image registry não encontrado em ${registryPath}. Criando um novo.`);
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
 * Rastreia os arquivos JSON de origem e garante que todos os metadados de imagens
 * estejam presentes no registro (criação de novas entradas).
 * @param {string} sourceDir A pasta contendo os arquivos JSON de origem.
 * @param {string} registryOutputFolder A pasta onde o img-registry.json reside (ex: ./output).
 * @returns {Promise<Array<Object>>} O registro de imagens com todas as entradas JSON.
 */
async function buildRegistryFromJsons(sourceDir, registryOutputFolder) {
    console.log(`\n--- RASTREAMENTO DE JSONS PARA REGISTRO DE IMAGENS ---`);

    // 1. Carrega o registro existente
    let imageRegistry = await loadRegistry(registryOutputFolder);
    const initialRegistrySize = imageRegistry.length;

    const parsedJsonData = await readAllJsons(sourceDir);

    let newItemsAdded = 0;

    for (const data of parsedJsonData) {        
        if (!data) continue;

        const { id, title, entityClass, url, filename, pageUrl } = data;
        
        // Apenas processa se houver uma URL de imagem válida e ID
        if (!id || !url ) {
            continue;
        }

        // Tenta encontrar o item no registro pelo ID (fonte de verdade)
        let registryItem = imageRegistry.find(item => item.id === id);

        if (!registryItem) {
            // Se não existe, cria uma nova entrada
            registryItem = {
                id: id,
                url: url,
                filename:filename,
                entityClass: entityClass,
                title: title || 'N/A',
                pageUrl: pageUrl || 'N/A',
                extracted: false, // Novo item é sempre 'false'
            };
            imageRegistry.push(registryItem);
            newItemsAdded++;
        }
    }

    if (newItemsAdded > 0) {
        await saveRegistry(registryOutputFolder, imageRegistry);
        console.log(`Rastreamento de JSON concluído. Adicionadas ${newItemsAdded} novas entradas. Total: ${imageRegistry.length}`);
    } else {
        console.log("Nenhuma nova entrada adicionada ao registro.");
    }

    return imageRegistry;
}

/**
 * Executa o rastreamento dos JSONs E a sincronização com o disco.
 * Esta é a função standalone que você executa para sincronizar o estado.
 */
async function syncImageRegistry(sourceDir, registryOutputFolder, imageDir) {
    // 1. RASTREAMENTO: Garante que todos os metadados JSON estejam no registro
    // O registro é criado/atualizado com as entradas do JSON, todas marcadas como 'extracted: false'
    const updatedRegistry = await buildRegistryFromJsons(sourceDir, registryOutputFolder);

    // 2. SINCRONIZAÇÃO DE STATUS: Verifica o disco e atualiza o status 'extracted: true'
    await synchronizeDiskStatus(registryOutputFolder, imageDir, updatedRegistry);

    console.log(`\nSincronização completa de registro e disco concluída.`);
}

/**
 * Escaneia a pasta de saída de imagens, verifica quais itens do registro existem
 * fisicamente e atualiza o status 'extracted: true' no registro em memória.
 * @param {string} registryOutputFolder A pasta onde o img-registry.json reside (ex: ./output).
 * @param {string} imageDir A pasta onde as imagens .jpg/png estão (ex: ./output/img).
 * @param {Array<Object>} imageRegistry O registro em memória, rastreado a partir dos JSONs.
 * @returns {Promise<number>} O número de registros atualizados para 'extracted: true'.
 */
async function synchronizeDiskStatus(registryOutputFolder, imageDir, imageRegistry) {
    console.log(`\n--- SINCRONIZAÇÃO DE STATUS COM DISCO ---`);
    
    if (imageRegistry.length === 0) {
        // Se a primeira fase (tracking) não encontrou JSONs válidos, não há o que sincronizar.
        return 0;
    }

    // 1. Lê a lista de arquivos existentes no disco
    await fs.mkdir(imageDir, { recursive: true }); 
    const outputEntries = await fs.readdir(imageDir, { withFileTypes: true });
    
    // Cria um Set para pesquisa rápida de nomes de arquivos
    const existingFilenames = new Set(
        outputEntries.filter(d => d.isFile()).map(d => d.name)
    );
    console.log(`Arquivos de imagem encontrados no disco: ${existingFilenames.size}`);
    
    let updatesCount = 0;
    
    // 2. Itera sobre o registro e atualiza o status
    for (const item of imageRegistry) {
        if (!item.extracted && existingFilenames.has(item.filename)) {
            item.extracted = true;
            updatesCount++;
        }
    }
    
    // 3. Salva o registro atualizado (se houver mudanças)
    if (updatesCount > 0) {
        await saveRegistry(registryOutputFolder, imageRegistry);
        console.log(`Sincronização de status concluída. ${updatesCount} itens marcados como 'extracted: true'.`);
    } else {
        console.log("Nenhuma alteração de status necessária no disco.");
    }

    return updatesCount;
}

module.exports = {
    loadRegistry,
    saveRegistry,
    syncImageRegistry
};