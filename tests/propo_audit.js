// Même audit d'accessibilité (axe, contraste compris) que a11y_audit.js, sur la proposition visuelle DA NOOVA (?propo).
process.env.A11Y_APP_QUERY='?propo';
require('./a11y_audit.js');
