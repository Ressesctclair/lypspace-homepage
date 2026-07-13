(function () {
  var LANGS = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
  ];

  var T = {
    en: {
      nav_home: 'Home', nav_catalog: 'Catalog', nav_contact: 'Contact',
      nav_signin: 'Sign in', nav_my_account: 'My Account',
      hero_cta: 'Shop all',
      featured_title: 'Featured',
      new_arrivals: 'New arrivals', shop_now: 'Shop now',
      cat_earrings: 'Earrings', cat_accessories: 'Accessories',
      val_title1: 'Intentional design', val_body1: 'Everything we do starts with why',
      val_title2: 'Made with care', val_body2: 'We believe in building better',
      val_title3: 'A team with a goal', val_body3: 'Real people making great products',
      brand_stmt: 'We create with intention. Our products solve real problems with clean design and honest materials.',
      pillar_title1: 'Quality first', pillar_body1: 'We obsess over the details and strive to deliver the best products at the best prices, every time.',
      pillar_title2: 'Customer care', pillar_body2: "We're always on your side: keeping our loyal customers happy is our top priority and number one goal.",
      signup_title: 'Stay in the loop', signup_body: 'Get exclusive deals and early access to new products',
      signup_ph: 'Your email address', subscribe_btn: 'Subscribe',
      subscribe_success: 'Subscribed! Check your inbox for a welcome email.',
      subscribe_invalid: 'Please enter a valid email address.',
      subscribe_error: 'Something went wrong. Please try again.',
      faq_title: 'Frequently asked questions',
      faq_q1: 'What is your return policy?', faq_a1: "We want you to be completely satisfied with your purchase. If you're not happy with your order, you can return most items within 30 days of delivery for a full refund or exchange.",
      faq_q2: 'Are there any final sale items?', faq_a2: 'Some items may be marked as final sale and are not eligible for returns or exchanges. These will be clearly noted on the product page before purchase.',
      faq_q3: 'How long does shipping take?', faq_a3: "Standard shipping typically takes 5–8 business days. Expedited options are available at checkout. You'll receive a tracking number as soon as your order ships.",
      faq_q4: 'Where are your products manufactured?', faq_a4: 'We work with trusted manufacturing partners who share our commitment to quality and ethical production. We carefully vet every partner to ensure our standards are met.',
      faq_q5: 'How much does shipping cost?', faq_a5: 'We offer transparent, fair shipping rates calculated at checkout based on your location and order size. Free shipping is available on qualifying orders.',
      footer_info: 'Information', footer_return: 'Return policy', footer_shipping: 'Shipping', footer_mfg: 'Manufacturing', footer_contact: 'Contact information',
      footer_policies: 'Policies', footer_privacy: 'Privacy policy', footer_refund: 'Refund policy', footer_terms: 'Terms of service', footer_ship_policy: 'Shipping policy',
      footer_copy: '© 2026 LYP SPACE',
      prod_size_label: 'Size', prod_qty_label: 'Quantity',
      prod_size_note: 'Although labeled size L, this piece runs small and fits more like S or small M.',
      prod_buy_btn: 'Buy Now — $126.00', prod_select_size: 'Please select a size',
      prod_cond: 'Condition', prod_brand_label: 'Brand', prod_size_tag: 'Labeled Size', prod_style: 'Style',
      prod_cond_val: 'Flawless', prod_size_tag_val: 'L (fits S–M)', prod_style_val: 'Tie, adjustable',
      co_title: 'Checkout', co_loading: 'Loading…', co_no_product: 'Product not found. Please go back and try again.',
      co_email: 'Email', co_coupon: 'Discount code (optional)', co_coupon_ph: 'Enter code',
      co_apply: 'Apply', co_pay: 'Proceed to Payment', co_redirecting: 'Redirecting…',
      co_email_req: 'Please enter your email', co_email_first: 'Please enter your email first',
      co_verifying: 'Verifying…', co_fail: 'Checkout failed. Please try again.', co_verify_fail: 'Failed to verify. Please try again.',
      nav_orders: 'Orders', nav_addresses: 'Addresses', nav_account: 'Account', nav_signout: 'Sign out',
      dash_welcome: 'Hello', dash_member: 'Member', dash_recent_orders: 'Recent orders', dash_loading: 'Loading…',
      dash_view_all: 'View all', dash_default_addr: 'Default shipping address', dash_quick_links: 'Quick links',
      dash_order_history: 'Order history', dash_manage_addr: 'Manage addresses', dash_admin_panel: 'Admin panel',
      dash_no_orders: 'No orders yet', dash_no_addr: 'No default address · Add one in address manager',
      status_shipped: 'Shipped', status_processing: 'Processing',
      prof_title: 'Address management', prof_saved: 'Saved addresses', prof_no_addr: 'No addresses saved',
      prof_add_new: 'Add new address', prof_name: 'Full name', prof_street: 'Street address', prof_city: 'City',
      prof_postal: 'Postal code', prof_country: 'Country', prof_is_default: 'Set as default',
      prof_save: 'Save address', prof_saved_ok: 'Address saved', prof_save_err: 'Save failed',
      prof_default: 'Default', prof_set_default: 'Set as default', prof_delete: 'Delete',
      prof_delete_confirm: 'Delete this address?', prof_change_pw: 'Change password',
      prof_cur_pw: 'Current password', prof_new_pw: 'New password (min. 8 characters)',
      prof_confirm_pw: 'Confirm new password', prof_update_pw: 'Update password',
      prof_pw_mismatch: 'Passwords do not match', prof_pw_updated: 'Password updated', prof_pw_err: 'Update failed',
      orders_title: 'Order history', orders_no_orders: 'No orders yet', orders_tracking: 'Tracking',
      login_title: 'Account', login_tab: 'Sign in', register_tab: 'Register',
      login_back: '← lypspace', login_or: 'or', login_google: 'Continue with Google',
    },
    es: {
      nav_home: 'Inicio', nav_catalog: 'Catálogo', nav_contact: 'Contacto',
      nav_signin: 'Iniciar sesión', nav_my_account: 'Mi cuenta',
      hero_cta: 'Ver todo',
      featured_title: 'Destacados',
      new_arrivals: 'Novedades', shop_now: 'Comprar ahora',
      cat_earrings: 'Aretes', cat_accessories: 'Accesorios',
      val_title1: 'Diseño intencional', val_body1: 'Todo lo que hacemos empieza con el porqué',
      val_title2: 'Hecho con cuidado', val_body2: 'Creemos en construir mejor',
      val_title3: 'Un equipo con un objetivo', val_body3: 'Personas reales haciendo grandes productos',
      brand_stmt: 'Creamos con intención. Nuestros productos resuelven problemas reales con diseño limpio y materiales honestos.',
      pillar_title1: 'Calidad primero', pillar_body1: 'Nos obsesionamos con los detalles y nos esforzamos por ofrecer los mejores productos a los mejores precios.',
      pillar_title2: 'Atención al cliente', pillar_body2: 'Siempre estamos de tu lado: mantener felices a nuestros clientes es nuestra máxima prioridad.',
      signup_title: 'Mantente al día', signup_body: 'Obtén ofertas exclusivas y acceso anticipado a nuevos productos',
      signup_ph: 'Tu correo electrónico', subscribe_btn: 'Suscribirse',
      subscribe_success: '¡Suscrito! Revisa tu bandeja de entrada para ver el correo de bienvenida.',
      subscribe_invalid: 'Por favor, introduce una dirección de correo válida.',
      subscribe_error: 'Algo salió mal. Inténtalo de nuevo.',
      faq_title: 'Preguntas frecuentes',
      faq_q1: '¿Cuál es tu política de devoluciones?', faq_a1: 'Queremos que estés completamente satisfecho. Puedes devolver la mayoría de los artículos dentro de 30 días.',
      faq_q2: '¿Hay artículos en venta final?', faq_a2: 'Algunos artículos pueden estar en venta final y no son elegibles para devoluciones o cambios.',
      faq_q3: '¿Cuánto tiempo tarda el envío?', faq_a3: 'El envío estándar generalmente tarda entre 5 y 8 días hábiles.',
      faq_q4: '¿Dónde se fabrican sus productos?', faq_a4: 'Trabajamos con socios de fabricación de confianza que comparten nuestro compromiso con la calidad.',
      faq_q5: '¿Cuánto cuesta el envío?', faq_a5: 'Ofrecemos tarifas de envío transparentes calculadas al momento del pago según tu ubicación.',
      footer_info: 'Información', footer_return: 'Política de devoluciones', footer_shipping: 'Envío', footer_mfg: 'Fabricación', footer_contact: 'Información de contacto',
      footer_policies: 'Políticas', footer_privacy: 'Política de privacidad', footer_refund: 'Política de reembolso', footer_terms: 'Términos de servicio', footer_ship_policy: 'Política de envío',
      footer_copy: '© 2026 LYP SPACE',
      prod_size_label: 'Talla', prod_qty_label: 'Cantidad',
      prod_size_note: 'Aunque etiquetada como talla L, esta pieza es pequeña y queda más como S o M pequeña.',
      prod_buy_btn: 'Comprar ahora — $126.00', prod_select_size: 'Por favor selecciona una talla',
      prod_cond: 'Condición', prod_brand_label: 'Marca', prod_size_tag: 'Talla etiquetada', prod_style: 'Estilo',
      prod_cond_val: 'Impecable', prod_size_tag_val: 'L (queda S–M)', prod_style_val: 'Atar, ajustable',
      co_title: 'Pago', co_loading: 'Cargando…', co_no_product: 'Producto no encontrado. Por favor regrese e intente de nuevo.',
      co_email: 'Correo electrónico', co_coupon: 'Código de descuento (opcional)', co_coupon_ph: 'Ingrese el código',
      co_apply: 'Aplicar', co_pay: 'Proceder al pago', co_redirecting: 'Redirigiendo…',
      co_email_req: 'Por favor ingrese su correo', co_email_first: 'Por favor ingrese su correo primero',
      co_verifying: 'Verificando…', co_fail: 'Error en el pago. Inténtelo de nuevo.', co_verify_fail: 'Error de verificación. Inténtelo de nuevo.',
      nav_orders: 'Pedidos', nav_addresses: 'Direcciones', nav_account: 'Cuenta', nav_signout: 'Cerrar sesión',
      dash_welcome: 'Hola', dash_member: 'Miembro', dash_recent_orders: 'Pedidos recientes', dash_loading: 'Cargando…',
      dash_view_all: 'Ver todo', dash_default_addr: 'Dirección de envío predeterminada', dash_quick_links: 'Accesos rápidos',
      dash_order_history: 'Historial de pedidos', dash_manage_addr: 'Gestionar direcciones', dash_admin_panel: 'Panel de administración',
      dash_no_orders: 'Sin pedidos aún', dash_no_addr: 'Sin dirección predeterminada · Añade una en el gestor de direcciones',
      status_shipped: 'Enviado', status_processing: 'Procesando',
      prof_title: 'Gestión de direcciones', prof_saved: 'Direcciones guardadas', prof_no_addr: 'Sin direcciones guardadas',
      prof_add_new: 'Añadir nueva dirección', prof_name: 'Nombre completo', prof_street: 'Dirección', prof_city: 'Ciudad',
      prof_postal: 'Código postal', prof_country: 'País', prof_is_default: 'Establecer como predeterminada',
      prof_save: 'Guardar dirección', prof_saved_ok: 'Dirección guardada', prof_save_err: 'Error al guardar',
      prof_default: 'Predeterminada', prof_set_default: 'Establecer como predeterminada', prof_delete: 'Eliminar',
      prof_delete_confirm: '¿Eliminar esta dirección?', prof_change_pw: 'Cambiar contraseña',
      prof_cur_pw: 'Contraseña actual', prof_new_pw: 'Nueva contraseña (mín. 8 caracteres)',
      prof_confirm_pw: 'Confirmar nueva contraseña', prof_update_pw: 'Actualizar contraseña',
      prof_pw_mismatch: 'Las contraseñas no coinciden', prof_pw_updated: 'Contraseña actualizada', prof_pw_err: 'Error al actualizar',
      orders_title: 'Historial de pedidos', orders_no_orders: 'Sin pedidos aún', orders_tracking: 'Seguimiento',
      login_title: 'Cuenta', login_tab: 'Iniciar sesión', register_tab: 'Registrarse',
      login_back: '← lypspace', login_or: 'o', login_google: 'Continuar con Google',
    },
    de: {
      nav_home: 'Startseite', nav_catalog: 'Katalog', nav_contact: 'Kontakt',
      nav_signin: 'Anmelden', nav_my_account: 'Mein Konto',
      hero_cta: 'Alle ansehen',
      featured_title: 'Empfohlen',
      new_arrivals: 'Neuheiten', shop_now: 'Jetzt kaufen',
      cat_earrings: 'Ohrringe', cat_accessories: 'Accessoires',
      val_title1: 'Bewusstes Design', val_body1: 'Alles, was wir tun, beginnt mit dem Warum',
      val_title2: 'Mit Sorgfalt gemacht', val_body2: 'Wir glauben daran, besser zu bauen',
      val_title3: 'Ein Team mit Ziel', val_body3: 'Echte Menschen machen großartige Produkte',
      brand_stmt: 'Wir gestalten mit Absicht. Unsere Produkte lösen echte Probleme mit klarem Design und ehrlichen Materialien.',
      pillar_title1: 'Qualität zuerst', pillar_body1: 'Wir sind besessen von Details und liefern stets die besten Produkte zu besten Preisen.',
      pillar_title2: 'Kundenbetreuung', pillar_body2: 'Wir stehen immer auf Ihrer Seite: Die Zufriedenheit unserer Kunden ist unsere oberste Priorität.',
      signup_title: 'Bleib informiert', signup_body: 'Erhalte exklusive Angebote und frühzeitigen Zugang zu neuen Produkten',
      signup_ph: 'Deine E-Mail-Adresse', subscribe_btn: 'Abonnieren',
      subscribe_success: 'Abonniert! Schau in dein Postfach für die Willkommens-E-Mail.',
      subscribe_invalid: 'Bitte gib eine gültige E-Mail-Adresse ein.',
      subscribe_error: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
      faq_title: 'Häufig gestellte Fragen',
      faq_q1: 'Was ist Ihre Rückgabepolitik?', faq_a1: 'Die meisten Artikel können innerhalb von 30 Tagen nach Lieferung zurückgegeben werden.',
      faq_q2: 'Gibt es Artikel im Endverkauf?', faq_a2: 'Einige Artikel können als Endverkauf markiert sein und sind nicht für Rückgaben berechtigt.',
      faq_q3: 'Wie lange dauert der Versand?', faq_a3: 'Der Standardversand dauert in der Regel 5–8 Werktage.',
      faq_q4: 'Wo werden Ihre Produkte hergestellt?', faq_a4: 'Wir arbeiten mit vertrauenswürdigen Fertigungspartnern zusammen, die unser Qualitätsengagement teilen.',
      faq_q5: 'Was kostet der Versand?', faq_a5: 'Transparente Versandkosten werden beim Checkout basierend auf Ihrem Standort berechnet.',
      footer_info: 'Informationen', footer_return: 'Rückgaberecht', footer_shipping: 'Versand', footer_mfg: 'Herstellung', footer_contact: 'Kontaktdaten',
      footer_policies: 'Richtlinien', footer_privacy: 'Datenschutzrichtlinie', footer_refund: 'Rückerstattungsrichtlinie', footer_terms: 'Nutzungsbedingungen', footer_ship_policy: 'Versandrichtlinie',
      footer_copy: '© 2026 LYP SPACE',
      prod_size_label: 'Größe', prod_qty_label: 'Menge',
      prod_size_note: 'Obwohl als Größe L gekennzeichnet, fällt dieses Stück klein aus und passt eher wie S oder kleines M.',
      prod_buy_btn: 'Jetzt kaufen — $126.00', prod_select_size: 'Bitte wählen Sie eine Größe',
      prod_cond: 'Zustand', prod_brand_label: 'Marke', prod_size_tag: 'Beschriftete Größe', prod_style: 'Stil',
      prod_cond_val: 'Makellos', prod_size_tag_val: 'L (passt S–M)', prod_style_val: 'Binde, verstellbar',
      co_title: 'Kasse', co_loading: 'Laden…', co_no_product: 'Produkt nicht gefunden. Bitte gehen Sie zurück.',
      co_email: 'E-Mail', co_coupon: 'Rabattcode (optional)', co_coupon_ph: 'Code eingeben',
      co_apply: 'Anwenden', co_pay: 'Zur Zahlung', co_redirecting: 'Weiterleitung…',
      co_email_req: 'Bitte E-Mail eingeben', co_email_first: 'Bitte zuerst E-Mail eingeben',
      co_verifying: 'Überprüfen…', co_fail: 'Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.', co_verify_fail: 'Überprüfung fehlgeschlagen. Bitte versuchen Sie es erneut.',
      nav_orders: 'Bestellungen', nav_addresses: 'Adressen', nav_account: 'Konto', nav_signout: 'Abmelden',
      dash_welcome: 'Hallo', dash_member: 'Mitglied', dash_recent_orders: 'Letzte Bestellungen', dash_loading: 'Laden…',
      dash_view_all: 'Alle ansehen', dash_default_addr: 'Standard-Lieferadresse', dash_quick_links: 'Schnellzugriff',
      dash_order_history: 'Bestellverlauf', dash_manage_addr: 'Adressen verwalten', dash_admin_panel: 'Admin-Bereich',
      dash_no_orders: 'Noch keine Bestellungen', dash_no_addr: 'Keine Standardadresse · Im Adressmanager hinzufügen',
      status_shipped: 'Versendet', status_processing: 'In Bearbeitung',
      prof_title: 'Adressverwaltung', prof_saved: 'Gespeicherte Adressen', prof_no_addr: 'Keine Adressen gespeichert',
      prof_add_new: 'Neue Adresse hinzufügen', prof_name: 'Vollständiger Name', prof_street: 'Straße und Hausnummer', prof_city: 'Stadt',
      prof_postal: 'Postleitzahl', prof_country: 'Land', prof_is_default: 'Als Standard festlegen',
      prof_save: 'Adresse speichern', prof_saved_ok: 'Adresse gespeichert', prof_save_err: 'Speichern fehlgeschlagen',
      prof_default: 'Standard', prof_set_default: 'Als Standard festlegen', prof_delete: 'Löschen',
      prof_delete_confirm: 'Diese Adresse löschen?', prof_change_pw: 'Passwort ändern',
      prof_cur_pw: 'Aktuelles Passwort', prof_new_pw: 'Neues Passwort (mind. 8 Zeichen)',
      prof_confirm_pw: 'Neues Passwort bestätigen', prof_update_pw: 'Passwort aktualisieren',
      prof_pw_mismatch: 'Passwörter stimmen nicht überein', prof_pw_updated: 'Passwort aktualisiert', prof_pw_err: 'Aktualisierung fehlgeschlagen',
      orders_title: 'Bestellverlauf', orders_no_orders: 'Noch keine Bestellungen', orders_tracking: 'Tracking',
      login_title: 'Konto', login_tab: 'Anmelden', register_tab: 'Registrieren',
      login_back: '← lypspace', login_or: 'oder', login_google: 'Mit Google fortfahren',
    },
    fr: {
      nav_home: 'Accueil', nav_catalog: 'Catalogue', nav_contact: 'Contact',
      nav_signin: 'Se connecter', nav_my_account: 'Mon compte',
      hero_cta: 'Tout voir',
      featured_title: 'En vedette',
      new_arrivals: 'Nouveautés', shop_now: 'Acheter maintenant',
      cat_earrings: "Boucles d'oreilles", cat_accessories: 'Accessoires',
      val_title1: 'Design intentionnel', val_body1: 'Tout ce que nous faisons commence par le pourquoi',
      val_title2: 'Fait avec soin', val_body2: 'Nous croyons en la construction de mieux',
      val_title3: 'Une équipe avec un objectif', val_body3: 'De vraies personnes fabriquant de grands produits',
      brand_stmt: 'Nous créons avec intention. Nos produits résolvent de vrais problèmes avec un design épuré et des matériaux honnêtes.',
      pillar_title1: 'La qualité avant tout', pillar_body1: "Nous sommes obsédés par les détails et livrons les meilleurs produits aux meilleurs prix.",
      pillar_title2: 'Service client', pillar_body2: "Nous sommes toujours de votre côté : satisfaire nos clients fidèles est notre priorité absolue.",
      signup_title: 'Restez informé', signup_body: 'Obtenez des offres exclusives et un accès anticipé aux nouveaux produits',
      signup_ph: 'Votre adresse e-mail', subscribe_btn: "S'abonner",
      subscribe_success: "Abonné(e) ! Consultez votre boîte de réception pour l'e-mail de bienvenue.",
      subscribe_invalid: 'Veuillez saisir une adresse e-mail valide.',
      subscribe_error: "Une erreur s'est produite. Veuillez réessayer.",
      faq_title: 'Questions fréquemment posées',
      faq_q1: 'Quelle est votre politique de retour ?', faq_a1: "Vous pouvez retourner la plupart des articles dans les 30 jours suivant la livraison.",
      faq_q2: "Y a-t-il des articles en vente finale ?", faq_a2: "Certains articles sont en vente finale et ne sont pas éligibles aux retours ou échanges.",
      faq_q3: "Combien de temps prend l'expédition ?", faq_a3: "L'expédition standard prend généralement 5 à 8 jours ouvrables.",
      faq_q4: 'Où vos produits sont-ils fabriqués ?', faq_a4: "Nous travaillons avec des partenaires de fabrication de confiance partageant notre engagement envers la qualité.",
      faq_q5: "Combien coûte l'expédition ?", faq_a5: "Des tarifs d'expédition transparents sont calculés lors du paiement selon votre emplacement.",
      footer_info: 'Informations', footer_return: 'Politique de retour', footer_shipping: 'Expédition', footer_mfg: 'Fabrication', footer_contact: 'Coordonnées',
      footer_policies: 'Politiques', footer_privacy: 'Politique de confidentialité', footer_refund: 'Politique de remboursement', footer_terms: "Conditions d'utilisation", footer_ship_policy: "Politique d'expédition",
      footer_copy: '© 2026 LYP SPACE',
      prod_size_label: 'Taille', prod_qty_label: 'Quantité',
      prod_size_note: "Bien qu'étiquetée en taille L, cette pièce est petite et convient davantage à une S ou M petite.",
      prod_buy_btn: 'Acheter maintenant — $126.00', prod_select_size: 'Veuillez sélectionner une taille',
      prod_cond: 'État', prod_brand_label: 'Marque', prod_size_tag: 'Taille indiquée', prod_style: 'Style',
      prod_cond_val: 'Impeccable', prod_size_tag_val: 'L (convient S–M)', prod_style_val: 'Lacets, ajustable',
      co_title: 'Paiement', co_loading: 'Chargement…', co_no_product: 'Produit introuvable. Veuillez revenir en arrière.',
      co_email: 'E-mail', co_coupon: 'Code de réduction (facultatif)', co_coupon_ph: 'Entrez le code',
      co_apply: 'Appliquer', co_pay: 'Procéder au paiement', co_redirecting: 'Redirection…',
      co_email_req: 'Veuillez saisir votre e-mail', co_email_first: "Veuillez d'abord saisir votre e-mail",
      co_verifying: 'Vérification…', co_fail: 'Échec du paiement. Veuillez réessayer.', co_verify_fail: 'Échec de la vérification. Veuillez réessayer.',
      nav_orders: 'Commandes', nav_addresses: 'Adresses', nav_account: 'Compte', nav_signout: 'Se déconnecter',
      dash_welcome: 'Bonjour', dash_member: 'Membre', dash_recent_orders: 'Commandes récentes', dash_loading: 'Chargement…',
      dash_view_all: 'Voir tout', dash_default_addr: 'Adresse de livraison par défaut', dash_quick_links: 'Liens rapides',
      dash_order_history: 'Historique des commandes', dash_manage_addr: 'Gérer les adresses', dash_admin_panel: "Panneau d'administration",
      dash_no_orders: "Aucune commande pour l'instant", dash_no_addr: "Aucune adresse par défaut · Ajoutez-en une dans le gestionnaire d'adresses",
      status_shipped: 'Expédié', status_processing: 'En traitement',
      prof_title: 'Gestion des adresses', prof_saved: 'Adresses enregistrées', prof_no_addr: 'Aucune adresse enregistrée',
      prof_add_new: 'Ajouter une nouvelle adresse', prof_name: 'Nom complet', prof_street: 'Adresse', prof_city: 'Ville',
      prof_postal: 'Code postal', prof_country: 'Pays', prof_is_default: 'Définir par défaut',
      prof_save: "Enregistrer l'adresse", prof_saved_ok: 'Adresse enregistrée', prof_save_err: "Échec de l'enregistrement",
      prof_default: 'Par défaut', prof_set_default: 'Définir par défaut', prof_delete: 'Supprimer',
      prof_delete_confirm: 'Supprimer cette adresse ?', prof_change_pw: 'Changer le mot de passe',
      prof_cur_pw: 'Mot de passe actuel', prof_new_pw: 'Nouveau mot de passe (min. 8 caractères)',
      prof_confirm_pw: 'Confirmer le nouveau mot de passe', prof_update_pw: 'Mettre à jour le mot de passe',
      prof_pw_mismatch: 'Les mots de passe ne correspondent pas', prof_pw_updated: 'Mot de passe mis à jour', prof_pw_err: 'Mise à jour échouée',
      orders_title: 'Historique des commandes', orders_no_orders: "Aucune commande pour l'instant", orders_tracking: 'Suivi',
      login_title: 'Compte', login_tab: 'Se connecter', register_tab: "S'inscrire",
      login_back: '← lypspace', login_or: 'ou', login_google: 'Continuer avec Google',
    },
    it: {
      nav_home: 'Home', nav_catalog: 'Catalogo', nav_contact: 'Contatto',
      nav_signin: 'Accedi', nav_my_account: 'Il mio account',
      hero_cta: 'Vedi tutto',
      featured_title: 'In evidenza',
      new_arrivals: 'Novità', shop_now: 'Acquista ora',
      cat_earrings: 'Orecchini', cat_accessories: 'Accessori',
      val_title1: 'Design intenzionale', val_body1: 'Tutto ciò che facciamo inizia con il perché',
      val_title2: 'Fatto con cura', val_body2: 'Crediamo nel costruire meglio',
      val_title3: 'Un team con un obiettivo', val_body3: 'Persone reali che fanno grandi prodotti',
      brand_stmt: 'Creiamo con intenzione. I nostri prodotti risolvono problemi reali con un design pulito e materiali onesti.',
      pillar_title1: 'Qualità prima di tutto', pillar_body1: 'Siamo ossessionati dai dettagli e consegniamo i migliori prodotti ai migliori prezzi.',
      pillar_title2: 'Assistenza clienti', pillar_body2: 'Siamo sempre dalla tua parte: mantenere felici i nostri clienti fedeli è la nostra massima priorità.',
      signup_title: 'Resta aggiornato', signup_body: 'Ottieni offerte esclusive e accesso anticipato ai nuovi prodotti',
      signup_ph: 'Il tuo indirizzo email', subscribe_btn: 'Iscriviti',
      subscribe_success: "Iscrizione avvenuta! Controlla la tua casella per l'email di benvenuto.",
      subscribe_invalid: 'Inserisci un indirizzo email valido.',
      subscribe_error: 'Qualcosa è andato storto. Riprova.',
      faq_title: 'Domande frequenti',
      faq_q1: 'Qual è la vostra politica di reso?', faq_a1: 'Puoi restituire la maggior parte degli articoli entro 30 giorni dalla consegna.',
      faq_q2: 'Ci sono articoli in saldo finale?', faq_a2: 'Alcuni articoli sono in saldo finale e non sono idonei per resi o cambi.',
      faq_q3: 'Quanto tempo richiede la spedizione?', faq_a3: 'La spedizione standard richiede in genere 5–8 giorni lavorativi.',
      faq_q4: 'Dove vengono prodotti i vostri prodotti?', faq_a4: "Collaboriamo con partner produttivi affidabili che condividono il nostro impegno per la qualità.",
      faq_q5: 'Quanto costa la spedizione?', faq_a5: 'Tariffe di spedizione trasparenti vengono calcolate al pagamento in base alla tua posizione.',
      footer_info: 'Informazioni', footer_return: 'Politica di reso', footer_shipping: 'Spedizione', footer_mfg: 'Produzione', footer_contact: 'Informazioni di contatto',
      footer_policies: 'Politiche', footer_privacy: 'Informativa sulla privacy', footer_refund: 'Politica di rimborso', footer_terms: 'Termini di servizio', footer_ship_policy: 'Politica di spedizione',
      footer_copy: '© 2026 LYP SPACE',
      prod_size_label: 'Taglia', prod_qty_label: 'Quantità',
      prod_size_note: "Sebbene etiquettato come taglia L, questo capo è piccolo e si adatta più come S o M piccola.",
      prod_buy_btn: 'Acquista ora — $126.00', prod_select_size: 'Seleziona una taglia',
      prod_cond: 'Condizione', prod_brand_label: 'Marca', prod_size_tag: 'Taglia indicata', prod_style: 'Stile',
      prod_cond_val: 'Perfetto', prod_size_tag_val: 'L (misura S–M)', prod_style_val: 'Lacci, regolabile',
      co_title: 'Pagamento', co_loading: 'Caricamento…', co_no_product: 'Prodotto non trovato. Torna indietro e riprova.',
      co_email: 'E-mail', co_coupon: 'Codice sconto (opzionale)', co_coupon_ph: 'Inserisci il codice',
      co_apply: 'Applica', co_pay: 'Procedi al pagamento', co_redirecting: 'Reindirizzamento…',
      co_email_req: 'Inserisci la tua email', co_email_first: 'Inserisci prima la tua email',
      co_verifying: 'Verifica…', co_fail: 'Pagamento fallito. Riprova.', co_verify_fail: 'Verifica fallita. Riprova.',
      nav_orders: 'Ordini', nav_addresses: 'Indirizzi', nav_account: 'Account', nav_signout: 'Disconnetti',
      dash_welcome: 'Ciao', dash_member: 'Membro', dash_recent_orders: 'Ordini recenti', dash_loading: 'Caricamento…',
      dash_view_all: 'Vedi tutto', dash_default_addr: 'Indirizzo di spedizione predefinito', dash_quick_links: 'Link rapidi',
      dash_order_history: 'Cronologia ordini', dash_manage_addr: 'Gestisci indirizzi', dash_admin_panel: 'Pannello admin',
      dash_no_orders: 'Nessun ordine ancora', dash_no_addr: 'Nessun indirizzo predefinito · Aggiungine uno nel gestore indirizzi',
      status_shipped: 'Spedito', status_processing: 'In elaborazione',
      prof_title: 'Gestione indirizzi', prof_saved: 'Indirizzi salvati', prof_no_addr: 'Nessun indirizzo salvato',
      prof_add_new: 'Aggiungi nuovo indirizzo', prof_name: 'Nome completo', prof_street: 'Indirizzo', prof_city: 'Città',
      prof_postal: 'Codice postale', prof_country: 'Paese', prof_is_default: 'Imposta come predefinito',
      prof_save: 'Salva indirizzo', prof_saved_ok: 'Indirizzo salvato', prof_save_err: 'Salvataggio fallito',
      prof_default: 'Predefinito', prof_set_default: 'Imposta come predefinito', prof_delete: 'Elimina',
      prof_delete_confirm: 'Eliminare questo indirizzo?', prof_change_pw: 'Cambia password',
      prof_cur_pw: 'Password attuale', prof_new_pw: 'Nuova password (min. 8 caratteri)',
      prof_confirm_pw: 'Conferma nuova password', prof_update_pw: 'Aggiorna password',
      prof_pw_mismatch: 'Le password non corrispondono', prof_pw_updated: 'Password aggiornata', prof_pw_err: 'Aggiornamento fallito',
      orders_title: 'Cronologia ordini', orders_no_orders: 'Nessun ordine ancora', orders_tracking: 'Tracking',
      login_title: 'Account', login_tab: 'Accedi', register_tab: 'Registrati',
      login_back: '← lypspace', login_or: 'oppure', login_google: 'Continua con Google',
    },
    pt: {
      nav_home: 'Início', nav_catalog: 'Catálogo', nav_contact: 'Contacto',
      nav_signin: 'Entrar', nav_my_account: 'A minha conta',
      hero_cta: 'Ver tudo',
      featured_title: 'Destaque',
      new_arrivals: 'Novidades', shop_now: 'Comprar agora',
      cat_earrings: 'Brincos', cat_accessories: 'Acessórios',
      val_title1: 'Design intencional', val_body1: 'Tudo o que fazemos começa com o porquê',
      val_title2: 'Feito com cuidado', val_body2: 'Acreditamos em construir melhor',
      val_title3: 'Uma equipa com um objetivo', val_body3: 'Pessoas reais a fazer grandes produtos',
      brand_stmt: 'Criamos com intenção. Os nossos produtos resolvem problemas reais com design limpo e materiais honestos.',
      pillar_title1: 'Qualidade em primeiro lugar', pillar_body1: 'Somos obcecados pelos detalhes e entregamos os melhores produtos aos melhores preços.',
      pillar_title2: 'Atendimento ao cliente', pillar_body2: 'Estamos sempre do seu lado: manter os nossos clientes satisfeitos é a nossa principal prioridade.',
      signup_title: 'Fique por dentro', signup_body: 'Obtenha ofertas exclusivas e acesso antecipado a novos produtos',
      signup_ph: 'O seu endereço de e-mail', subscribe_btn: 'Subscrever',
      subscribe_success: 'Subscrito! Verifique a sua caixa de entrada para o email de boas-vindas.',
      subscribe_invalid: 'Por favor, insira um endereço de email válido.',
      subscribe_error: 'Algo correu mal. Tente novamente.',
      faq_title: 'Perguntas frequentes',
      faq_q1: 'Qual é a sua política de devoluções?', faq_a1: 'Pode devolver a maioria dos artigos no prazo de 30 dias após a entrega.',
      faq_q2: 'Existem artigos em venda final?', faq_a2: 'Alguns artigos são de venda final e não são elegíveis para devoluções ou trocas.',
      faq_q3: 'Quanto tempo demora o envio?', faq_a3: 'O envio padrão geralmente demora 5 a 8 dias úteis.',
      faq_q4: 'Onde são fabricados os seus produtos?', faq_a4: 'Trabalhamos com parceiros de fabricação de confiança que partilham o nosso compromisso com a qualidade.',
      faq_q5: 'Quanto custa o envio?', faq_a5: 'Tarifas de envio transparentes são calculadas no checkout com base na sua localização.',
      footer_info: 'Informações', footer_return: 'Política de devoluções', footer_shipping: 'Envio', footer_mfg: 'Fabrico', footer_contact: 'Informações de contacto',
      footer_policies: 'Políticas', footer_privacy: 'Política de privacidade', footer_refund: 'Política de reembolso', footer_terms: 'Termos de serviço', footer_ship_policy: 'Política de envio',
      footer_copy: '© 2026 LYP SPACE',
      prod_size_label: 'Tamanho', prod_qty_label: 'Quantidade',
      prod_size_note: 'Embora etiquetado como tamanho L, esta peça é pequena e cabe mais como S ou M pequeno.',
      prod_buy_btn: 'Comprar agora — $126.00', prod_select_size: 'Por favor selecione um tamanho',
      prod_cond: 'Condição', prod_brand_label: 'Marca', prod_size_tag: 'Tamanho indicado', prod_style: 'Estilo',
      prod_cond_val: 'Impecável', prod_size_tag_val: 'L (cabe S–M)', prod_style_val: 'Laço, ajustável',
      co_title: 'Pagamento', co_loading: 'A carregar…', co_no_product: 'Produto não encontrado. Por favor volte atrás.',
      co_email: 'E-mail', co_coupon: 'Código de desconto (opcional)', co_coupon_ph: 'Insira o código',
      co_apply: 'Aplicar', co_pay: 'Prosseguir para pagamento', co_redirecting: 'A redirecionar…',
      co_email_req: 'Por favor insira o seu e-mail', co_email_first: 'Por favor insira primeiro o seu e-mail',
      co_verifying: 'A verificar…', co_fail: 'Pagamento falhou. Tente novamente.', co_verify_fail: 'Verificação falhou. Tente novamente.',
      nav_orders: 'Encomendas', nav_addresses: 'Endereços', nav_account: 'Conta', nav_signout: 'Terminar sessão',
      dash_welcome: 'Olá', dash_member: 'Membro', dash_recent_orders: 'Encomendas recentes', dash_loading: 'A carregar…',
      dash_view_all: 'Ver tudo', dash_default_addr: 'Endereço de envio predefinido', dash_quick_links: 'Ligações rápidas',
      dash_order_history: 'Histórico de encomendas', dash_manage_addr: 'Gerir endereços', dash_admin_panel: 'Painel de administração',
      dash_no_orders: 'Sem encomendas ainda', dash_no_addr: 'Sem endereço predefinido · Adicione um no gestor de endereços',
      status_shipped: 'Enviado', status_processing: 'Em processamento',
      prof_title: 'Gestão de endereços', prof_saved: 'Endereços guardados', prof_no_addr: 'Sem endereços guardados',
      prof_add_new: 'Adicionar novo endereço', prof_name: 'Nome completo', prof_street: 'Morada', prof_city: 'Cidade',
      prof_postal: 'Código postal', prof_country: 'País', prof_is_default: 'Definir como predefinido',
      prof_save: 'Guardar endereço', prof_saved_ok: 'Endereço guardado', prof_save_err: 'Falha ao guardar',
      prof_default: 'Predefinido', prof_set_default: 'Definir como predefinido', prof_delete: 'Eliminar',
      prof_delete_confirm: 'Eliminar este endereço?', prof_change_pw: 'Alterar palavra-passe',
      prof_cur_pw: 'Palavra-passe atual', prof_new_pw: 'Nova palavra-passe (mín. 8 caracteres)',
      prof_confirm_pw: 'Confirmar nova palavra-passe', prof_update_pw: 'Atualizar palavra-passe',
      prof_pw_mismatch: 'As palavras-passe não coincidem', prof_pw_updated: 'Palavra-passe atualizada', prof_pw_err: 'Falha na atualização',
      orders_title: 'Histórico de encomendas', orders_no_orders: 'Sem encomendas ainda', orders_tracking: 'Rastreamento',
      login_title: 'Conta', login_tab: 'Entrar', register_tab: 'Registar',
      login_back: '← lypspace', login_or: 'ou', login_google: 'Continuar com Google',
    },
  };

  function getLang() { return localStorage.getItem('lyp_lang') || 'en'; }

  function t(key) {
    var lang = getLang();
    return (T[lang] && T[lang][key] !== undefined ? T[lang][key] : T.en[key]) || key;
  }

  function applyTranslations(lang) {
    var d = T[lang] || T.en;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = d[key] !== undefined ? d[key] : (T.en[key] || key);
      el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      var val = d[key] !== undefined ? d[key] : (T.en[key] || key);
      el.placeholder = val;
    });
  }

  function updateSwitcher(code) {
    var found = LANGS.find(function (l) { return l.code === code; });
    var cur = document.getElementById('i18n-current');
    if (cur && found) cur.textContent = found.label;
    document.querySelectorAll('.i18n-opt').forEach(function (b) {
      b.classList.toggle('active', b.dataset.lang === code);
    });
  }

  function setLang(code) {
    localStorage.setItem('lyp_lang', code);
    applyTranslations(code);
    updateSwitcher(code);
  }

  function injectSwitcher() {
    var style = document.createElement('style');
    style.textContent = [
      '.i18n-wrap{position:relative;display:inline-flex;align-items:center;}',
      '.i18n-btn{background:none;border:none;font-size:13px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;font-family:inherit;color:#111;display:flex;align-items:center;gap:4px;padding:0;}',
      '.i18n-btn::after{content:"▾";font-size:10px;opacity:.6;}',
      '.i18n-drop{display:none;position:absolute;right:0;top:calc(100% + 8px);background:#fff;border:1px solid #e0e0e0;min-width:150px;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.1);}',
      '.i18n-wrap.open .i18n-drop{display:block;}',
      '.i18n-opt{display:block;width:100%;padding:10px 16px;background:none;border:none;font-size:13px;text-align:left;cursor:pointer;font-family:inherit;color:#111;white-space:nowrap;}',
      '.i18n-opt:hover,.i18n-opt.active{background:#f5f5f5;font-weight:500;}',
    ].join('');
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'i18n-wrap';
    wrap.innerHTML = '<button class="i18n-btn"><span id="i18n-current">English</span></button>'
      + '<div class="i18n-drop">'
      + LANGS.map(function (l) { return '<button class="i18n-opt" data-lang="' + l.code + '">' + l.label + '</button>'; }).join('')
      + '</div>';

    wrap.querySelector('.i18n-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    wrap.querySelectorAll('.i18n-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        setLang(b.dataset.lang);
        wrap.classList.remove('open');
      });
    });
    document.addEventListener('click', function () { wrap.classList.remove('open'); });

    var icons = document.querySelector('.header-icons');
    if (icons) {
      icons.insertBefore(wrap, icons.firstChild);
    } else {
      var hdr = document.querySelector('header');
      if (hdr) hdr.appendChild(wrap);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectSwitcher();
    var lang = getLang();
    applyTranslations(lang);
    updateSwitcher(lang);
  });

  window.i18n = { t: t, getLang: getLang, setLang: setLang };
})();
