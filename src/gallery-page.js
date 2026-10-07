import { startPage } from './gallery.js';
import { startupError, revealPage } from './page-startup.js';

startPage({ page: 'gallery' }).then(revealPage).catch(startupError);
