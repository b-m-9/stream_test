module.exports = {
    204: () => {
        return {message: 'meta is not found', code: 204, stack: new Error().stack}
    },
    404: () => {
        return {message: 'meta is not found', code: 404, stack: new Error().stack}
    },
};