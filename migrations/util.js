module.exports = {

    getModels,
    getModelAttributes,
    getIndexName,

    addTableColumn,
    getColumnName,
    createTable,
    addColumns,
    dropTable,
    dropColumns,
    getIndexes,
    getIndexesKeyNames,

};

const fs = require('fs');
const path = require('path');
const _ = require('lodash');

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

function getIndexName(tableName, columnNames) {
    return tableName + '_' + columnNames.join('_') + '_index';
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

function getColumnName(field, attributes) {
    if (!attributes[field]) return;

    return attributes[field].columnName || field;
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

    await connection.schema.createTable(model.tableName, table => {
        fields.forEach(field => {
            addTableColumn(model, field, table);
        });
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

async function getIndexes(tableName, connection) {
    const rawResult = await connection.schema.raw(`SHOW INDEXES FROM ${tableName}`);
    return rawResult[0];
}

async function getIndexesKeyNames(tableName, connection) {
    const rawResult = await getIndexes(tableName, connection);
    return rawResult.map(result => result.Key_name);
}
