module.exports = {

    getModels,
    getModelAttributes,
    getIndexName,
    getColumnName,

    addTableColumn,
    addTableIndex,

    createTable,
    addColumns,
    addIndexes,

    dropTable,
    dropColumns,
    dropIndexes,

    getIndexes,
    getIndexesKeyNames,

};

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const Promise = require('bluebird');

const modelsPath = path.join(__dirname, '../api/models');

let models;
let indexedModels;

function getModels() {
    if (models) return models;

    let modelFiles = fs.readdirSync(modelsPath);

    modelFiles = modelFiles.filter(name => {
        return name.endsWith('.js');
    });

    models = modelFiles.map(filename => {
        const modelName = filename.replace('.js', '');

        return {
            name: modelName,
            tableName: modelName.toLowerCase(),
            definition: require('../api/models/' + modelName),
        };
    });

    return models;
}

function getIndexedModels() {
    if (indexedModels) return indexedModels;

    const models = getModels();
    return _.indexBy(models, 'name');
}

function getModelAttributes(model) {
    const { definition: { attributes } } = model;
    return attributes;
}

function getModelIndexes(model) {
    const { definition: { indexes } } = model;
    return indexes;
}

function getIndexName(tableName, field, attributes) {
    const columnName = getColumnName(field, attributes);
    if (!columnName) return;

    return `${tableName}_${columnName}_index`;
}

function getColumnName(field, attributes) {
    if (!attributes[field]) return;

    return attributes[field].columnName || field;
}

/**
 * Define the table column
 * @param {Object} model
 * @param {String} field
 * @param {Object} table
 */
function addTableColumn(model, field, table) {
    const attributes = getModelAttributes(model);

    const columnName = getColumnName(field, attributes);
    let column;

    const fieldAttrs = attributes[field];
    if (!fieldAttrs) {
        throw new Error(`Unknown field: ${model.tableName}.${field}`);
    }

    if (fieldAttrs.autoIncrement) {
        column = table.increments(columnName);
    } else {
        column = table.specificType(columnName, fieldAttrs.columnType);
    }

    if (fieldAttrs.unique) {
        column.unique();
    }
    if (fieldAttrs.hasOwnProperty('allowNull') && !fieldAttrs.allowNull) {
        column.notNullable();
    }
}

/**
 * Define a table index
 * @param {Object} model
 * @param {String} field
 * @param {Object} table
 */
function addTableIndex(model, field, table) {
    const attributes = getModelAttributes(model);

    const columnName = getColumnName(field, attributes);
    if (!columnName) {
        throw new Error(`Unknown field: ${model.tableName}.${field}`);
    }

    const indexName = getIndexName(model.tableName, field, attributes);

    table.index(columnName, indexName);
}

/**
 * Create a new table
 * @param {String} modelName
 * @param {Object} connection
 */
async function createTable(modelName, connection) {
    const indexedModels = getIndexedModels();

    const model = indexedModels[modelName];
    if (!model) {
        throw new Error(`Unknown model: ${modelName}`);
    }

    // Stop the process if the table is existing
    const exists = await connection.schema.hasTable(model.tableName);
    if (exists) return;

    const attributes = getModelAttributes(model);
    const fields = Object.keys(attributes);
    const modelIndexes = getModelIndexes(model);

    await connection.schema.createTable(model.tableName, table => {
        fields.forEach(field => {
            addTableColumn(model, field, table);
        });

        if (modelIndexes && modelIndexes.length) {
            modelIndexes.forEach(indexField => {
                addTableIndex(model, indexField, table);
            });
        }
    });
}

/**
 * Create columns on a table
 * @param {String} modelName
 * @param {String[]} fields
 * @param {Object} connection
 */
async function addColumns(modelName, fields, connection) {
    const indexedModels = getIndexedModels();

    const model = indexedModels[modelName];
    if (!model) {
        throw new Error(`Unknown model: ${modelName}`);
    }

    // The table must exist
    const exists = await connection.schema.hasTable(model.tableName);
    if (!exists) {
        throw new Error(`Nonexistent table: ${model.tableName}`);
    }

    const attributes = getModelAttributes(model);

    // Check the columns existence and create the nonexistent ones
    return Promise.mapSeries(fields, async (field) => {
        const columnName = getColumnName(field, attributes);
        if (!columnName) {
            throw new Error(`Unknown field: ${model.name}.${field}`);
        }

        const existsColumn = await connection.schema.hasColumn(model.tableName, columnName);
        if (existsColumn) return;

        await connection.schema.table(model.tableName, table => {
            addTableColumn(model, field, table);
        });
    });
}

/**
 * Create index on a table
 * @param {String} modelName
 * @param {String[]} indexes
 * @param {Object} connection
 */
async function addIndexes(modelName, indexes, connection) {
    const indexedModels = getIndexedModels();

    const model = indexedModels[modelName];
    if (!model) {
        throw new Error(`Unknown model: ${modelName}`);
    }

    // The table must exist
    const exists = await connection.schema.hasTable(model.tableName);
    if (!exists) {
        throw new Error(`Nonexistent table: ${model.tableName}`);
    }

    const attributes = getModelAttributes(model);

    const tableIndexes = await getIndexesKeyNames(model.tableName, connection);
    const hashTableIndexes = _.indexBy(tableIndexes);

    // Check the indexes existence and create the nonexistent ones
    return Promise.mapSeries(indexes, async (field) => {
        const indexName = getIndexName(model.tableName, field, attributes);
        if (!indexName) {
            throw new Error(`Unknown field: ${model.name}.${field}`);
        }

        const existsIndex = hashTableIndexes[indexName];
        if (existsIndex) return;

        await connection.schema.table(model.tableName, table => {
            addTableIndex(model, field, table);
        });
    });
}

/**
 * Drop a table
 * @param {String} modelName
 * @param {Object} connection
 */
async function dropTable(modelName, connection) {
    const indexedModels = getIndexedModels();

    const model = indexedModels[modelName];
    if (!model) {
        throw new Error(`Unknown model: ${modelName}`);
    }

    // Stop the process if the table isn't existing
    const exists = await connection.schema.hasTable(model.tableName);
    if (!exists) return;

    await connection.schema.dropTable(model.tableName);
}

/**
 * Drop columns on a table
 * @param {String} modelName
 * @param {String[]} fields
 * @param {Object} connection
 */
async function dropColumns(modelName, fields, connection) {
    const indexedModels = getIndexedModels();

    const model = indexedModels[modelName];
    if (!model) {
        throw new Error(`Unknown model: ${modelName}`);
    }

    // The table must exist
    const exists = await connection.schema.hasTable(model.tableName);
    if (!exists) {
        throw new Error(`Nonexistent table: ${model.tableName}`);
    }

    const attributes = getModelAttributes(model);

    // Check the columns existence and drop the existing ones
    return Promise.mapSeries(fields, async (field) => {
        const columnName = getColumnName(field, attributes);
        if (!columnName) {
            throw new Error(`Unknown field: ${model.name}.${field}`);
        }

        const existsColumn = await connection.schema.hasColumn(model.tableName, columnName);
        if (!existsColumn) return;

        await connection.schema.table(model.tableName, table => {
            table.dropColumn(columnName);
        });
    });
}

/**
 * Drop indexes on a table
 * @param {String} modelName
 * @param {String[]} indexes
 * @param {Object} connection
 */
async function dropIndexes(modelName, indexes, connection) {
    const indexedModels = getIndexedModels();

    const model = indexedModels[modelName];
    if (!model) {
        throw new Error(`Unknown model: ${modelName}`);
    }

    // The table must exist
    const exists = await connection.schema.hasTable(model.tableName);
    if (!exists) {
        throw new Error(`Nonexistent table: ${model.tableName}`);
    }

    const attributes = getModelAttributes(model);

    const tableIndexes = await getIndexesKeyNames(model.tableName, connection);
    const hashTableIndexes = _.indexBy(tableIndexes);

    // Check the indexes existence and drop the existing ones
    return Promise.mapSeries(indexes, async (field) => {
        const indexName = getIndexName(model.tableName, field, attributes);
        if (!indexName) {
            throw new Error(`Unknown field: ${model.name}.${field}`);
        }

        const columnName = getColumnName(field, attributes);

        const existsIndex = hashTableIndexes[indexName];
        if (!existsIndex) return;

        await connection.schema.table(model.tableName, table => {
            table.dropIndex(columnName, indexName);
        });
    });
}

async function getIndexes(tableName, connection) {
    const rawResult = await connection.schema.raw(`SHOW INDEXES FROM ${tableName}`);
    return rawResult[0];
}

async function getIndexesKeyNames(tableName, connection) {
    const rawResult = await getIndexes(tableName, connection);
    return rawResult.map(result => result.Key_name);
}
