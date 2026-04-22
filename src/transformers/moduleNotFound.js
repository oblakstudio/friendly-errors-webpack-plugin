'use strict';

const TYPE = 'module-not-found';

function isModuleNotFoundError (e) {
  return e.name === 'ModuleNotFoundError'
    && typeof e.message === 'string'
    && e.message.indexOf('Module not found') === 0;
}

function getRequest (webpackError) {
  const dependencies = webpackError.dependencies;
  if (dependencies && dependencies.length > 0) {
    const dependency = dependencies[0];
    return dependency.request || (dependency.options && dependency.options.request);
  }
  // webpack 5: ModuleNotFoundError no longer carries dependencies; parse the
  // underlying resolver message instead ("Can't resolve '<request>' in '<dir>'").
  const source = (webpackError.error && webpackError.error.message) || webpackError.message || '';
  const match = /Can't resolve '([^']+)'/.exec(source);
  return match ? match[1] : undefined;
}

function transform(error) {
  const webpackError = error.webpackError;
  if (isModuleNotFoundError(error)) {
    const module = getRequest(webpackError);
    return Object.assign({}, error, {
      message: `Module not found ${module}`,
      type: TYPE,
      severity: 900,
      module,
      name: 'Module not found'
    });
  }

  return error;
}

module.exports = transform;
