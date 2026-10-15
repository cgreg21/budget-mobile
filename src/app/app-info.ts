import pkg from '../../package.json';

/** The version of the application, read from package.json so there is a single place to bump. */
export const APP_VERSION: string = pkg.version;
