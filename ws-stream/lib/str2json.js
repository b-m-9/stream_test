module.exports = (candidate) => {
    // .then(fn(json){})
    // .catch(fn(err_stack){})
    return new Promise(function (resolve, reject) {
        return resolve(JSON.parse(candidate));
    });
};