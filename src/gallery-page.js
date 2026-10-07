import { startPage } from './gallery.js';
import { startupError } from './page-startup.js';

startPage({ page: 'gallery' }).catch(startupError);
