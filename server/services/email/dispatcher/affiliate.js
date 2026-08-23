const logger = require('../../../utils/logger');
// Affiliate-facing email dispatchers.
// Extracted from utils/emailService.js in Phase 2.

const { loadTemplate, fillTemplate, formatTimeSlot } = require('../template-manager');
const { sendEmail } = require('../transport');
const brand = require('../../../config/brand');
// =============================================================================
// Affiliate Emails
// =============================================================================

/**
 * Send welcome email to a new affiliate
 */
exports.sendAffiliateWelcomeEmail = async (affiliate) => {
  try {
    const language = affiliate.languagePreference || 'en';
    const template = await loadTemplate('affiliate-welcome', language);
    const landingPageUrl = `https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program?route=/affiliate-landing&code=${affiliate.affiliateId}`;

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: `Welcome to ${brand.displayName} Affiliate Program`,
        EMAIL_HEADER: 'Welcome to the Affiliate Program!',
        GREETING: `Hi ${affiliate.firstName},`,
        WELCOME_MESSAGE: `Congratulations and welcome to the ${brand.displayName} Affiliate Program! We\'re excited to have you join our network of affiliate partners.`,
        READY_MESSAGE: 'You\'re now ready to start offering premium wash, dry, fold laundry services to your customers, with pickup and delivery handled by you.',
        YOUR_INFO_TITLE: 'Your Affiliate Information',
        AFFILIATE_ID_LABEL: 'Affiliate ID',
        LANDING_PAGE_LABEL: 'Customer Landing Page',
        LANDING_PAGE_DESC: 'Share this professional landing page with potential customers to showcase your services and pricing.',
        GETTING_STARTED_TITLE: 'Getting Started',
        STEP_1: 'Customers join by claiming one of your laundry bags.',
        STEP_2: 'Receive laundry bags with unique barcodes for your customers',
        STEP_3: 'Coordinate pickups and deliveries based on customer schedules',
        STEP_4: `Bring the laundry to our ${brand.displayName} location for washing, drying, and folding`,
        STEP_5: 'Deliver clean laundry back to your customers',
        STEP_6: 'Earn commissions on every order!',
        COMMISSION_LABEL: 'COMMISSION ON WDF',
        DELIVERY_FEES_LABEL: 'OF DELIVERY FEES',
        STARTUP_COST_LABEL: 'STARTUP COST',
        DASHBOARD_MESSAGE: 'Login to your dashboard to manage your affiliate account, track orders, and view your earnings.',
        DASHBOARD_BUTTON: 'Go to Dashboard'
      },
      es: {
        EMAIL_TITLE: `Bienvenido al Programa de Afiliados de ${brand.displayName}`,
        EMAIL_HEADER: '¡Bienvenido al Programa de Afiliados!',
        GREETING: `Hola ${affiliate.firstName},`,
        WELCOME_MESSAGE: `¡Felicitaciones y bienvenido al Programa de Afiliados de ${brand.displayName}! Estamos emocionados de que se una a nuestra red de socios afiliados.`,
        READY_MESSAGE: 'Ahora está listo para comenzar a ofrecer servicios premium de lavado, secado y doblado de ropa, con recogida y entrega manejados por usted.',
        YOUR_INFO_TITLE: 'Su Información de Afiliado',
        AFFILIATE_ID_LABEL: 'ID de Afiliado',
        LANDING_PAGE_LABEL: 'Página de Destino para Clientes',
        LANDING_PAGE_DESC: 'Comparta esta página profesional con clientes potenciales para mostrar sus servicios y precios.',
        GETTING_STARTED_TITLE: 'Primeros Pasos',
        STEP_1: 'Los clientes se unen reclamando una de tus bolsas de lavandería.',
        STEP_2: 'Reciba bolsas de lavandería con códigos de barras únicos para sus clientes',
        STEP_3: 'Coordine recogidas y entregas según los horarios de los clientes',
        STEP_4: `Lleve la ropa a nuestra ubicación ${brand.displayName} para lavar, secar y doblar`,
        STEP_5: 'Entregue la ropa limpia a sus clientes',
        STEP_6: '¡Gane comisiones en cada pedido!',
        COMMISSION_LABEL: 'COMISIÓN EN WDF',
        DELIVERY_FEES_LABEL: 'DE TARIFAS DE ENTREGA',
        STARTUP_COST_LABEL: 'COSTO INICIAL',
        DASHBOARD_MESSAGE: 'Inicie sesión en su panel para administrar su cuenta de afiliado, rastrear pedidos y ver sus ganancias.',
        DASHBOARD_BUTTON: 'Ir al Panel'
      },
      pt: {
        EMAIL_TITLE: `Bem-vindo ao Programa de Afiliados ${brand.displayName}`,
        EMAIL_HEADER: 'Bem-vindo ao Programa de Afiliados!',
        GREETING: `Olá ${affiliate.firstName},`,
        WELCOME_MESSAGE: `Parabéns e bem-vindo ao Programa de Afiliados ${brand.displayName}! Estamos animados em tê-lo em nossa rede de parceiros afiliados.`,
        READY_MESSAGE: 'Você está pronto para começar a oferecer serviços premium de lavar, secar e dobrar roupas, com coleta e entrega gerenciadas por você.',
        YOUR_INFO_TITLE: 'Suas Informações de Afiliado',
        AFFILIATE_ID_LABEL: 'ID de Afiliado',
        LANDING_PAGE_LABEL: 'Página de Destino para Clientes',
        LANDING_PAGE_DESC: 'Compartilhe esta página profissional com clientes em potencial para mostrar seus serviços e preços.',
        GETTING_STARTED_TITLE: 'Primeiros Passos',
        STEP_1: 'Os clientes aderem resgatando uma de suas sacolas de lavanderia.',
        STEP_2: 'Receba sacolas de lavanderia com códigos de barras exclusivos para seus clientes',
        STEP_3: 'Coordene coletas e entregas com base nos horários dos clientes',
        STEP_4: `Leve a roupa para nossa localização ${brand.displayName} para lavar, secar e dobrar`,
        STEP_5: 'Entregue roupas limpas de volta aos seus clientes',
        STEP_6: 'Ganhe comissões em cada pedido!',
        COMMISSION_LABEL: 'COMISSÃO EM WDF',
        DELIVERY_FEES_LABEL: 'DAS TAXAS DE ENTREGA',
        STARTUP_COST_LABEL: 'CUSTO INICIAL',
        DASHBOARD_MESSAGE: 'Faça login em seu painel para gerenciar sua conta de afiliado, rastrear pedidos e visualizar seus ganhos.',
        DASHBOARD_BUTTON: 'Ir para o Painel'
      },
      de: {
        EMAIL_TITLE: `Willkommen beim ${brand.displayName} Affiliate-Programm`,
        EMAIL_HEADER: 'Willkommen beim Affiliate-Programm!',
        GREETING: `Hallo ${affiliate.firstName},`,
        WELCOME_MESSAGE: `Herzlichen Glückwunsch und willkommen beim ${brand.displayName} Affiliate-Programm! Wir freuen uns, Sie in unserem Netzwerk von Affiliate-Partnern begrüßen zu dürfen.`,
        READY_MESSAGE: 'Sie sind jetzt bereit, Premium-Wasch-, Trocken- und Faltservice anzubieten, wobei Abholung und Lieferung von Ihnen übernommen werden.',
        YOUR_INFO_TITLE: 'Ihre Affiliate-Informationen',
        AFFILIATE_ID_LABEL: 'Affiliate-ID',
        LANDING_PAGE_LABEL: 'Kunden-Landingpage',
        LANDING_PAGE_DESC: 'Teilen Sie diese professionelle Landingpage mit potenziellen Kunden, um Ihre Dienstleistungen und Preise zu präsentieren.',
        GETTING_STARTED_TITLE: 'Erste Schritte',
        STEP_1: 'Kunden treten bei, indem sie einen Ihrer Wäschebeutel einlösen.',
        STEP_2: 'Erhalten Sie Wäschesäcke mit einzigartigen Barcodes für Ihre Kunden',
        STEP_3: 'Koordinieren Sie Abholungen und Lieferungen basierend auf Kundenterminen',
        STEP_4: `Bringen Sie die Wäsche zu unserem ${brand.displayName}-Standort zum Waschen, Trocknen und Falten`,
        STEP_5: 'Liefern Sie saubere Wäsche an Ihre Kunden zurück',
        STEP_6: 'Verdienen Sie Provisionen bei jeder Bestellung!',
        COMMISSION_LABEL: 'PROVISION AUF WDF',
        DELIVERY_FEES_LABEL: 'DER LIEFERGEBÜHREN',
        STARTUP_COST_LABEL: 'STARTKOSTEN',
        DASHBOARD_MESSAGE: 'Melden Sie sich in Ihrem Dashboard an, um Ihr Affiliate-Konto zu verwalten, Bestellungen zu verfolgen und Ihre Einnahmen anzuzeigen.',
        DASHBOARD_BUTTON: 'Zum Dashboard'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      first_name: affiliate.firstName,
      last_name: affiliate.lastName,
      affiliate_id: affiliate.affiliateId,
      AFFILIATE_ID: affiliate.affiliateId,
      landing_page_url: landingPageUrl,
      LANDING_PAGE_URL: landingPageUrl,
      login_url: 'https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program?login=affiliate',
      LOGIN_URL: 'https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program?login=affiliate',
      dashboard_url: 'https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program?login=affiliate',
      DASHBOARD_URL: 'https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program?login=affiliate',
      current_year: new Date().getFullYear(),
      CURRENT_YEAR: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: `Welcome to ${brand.displayName} Affiliate Program`,
      es: `Bienvenido al Programa de Afiliados de ${brand.displayName}`,
      pt: `Bem-vindo ao Programa de Afiliados ${brand.displayName}`,
      de: `Willkommen beim ${brand.displayName} Affiliate-Programm`
    };
    const subject = subjects[language] || subjects.en;

    // No attachments - using linked logo in HTML
    await sendEmail(
      affiliate.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending affiliate welcome email:', error);
  }
};

/**
 * Send new customer notification to affiliate
 */
exports.sendAffiliateNewCustomerEmail = async (affiliate, customer, bagInfo = {}) => {
  try {
    // Debug logging
    logger.info('[sendAffiliateNewCustomerEmail] Affiliate:', affiliate ? {
      email: affiliate.email,
      affiliateId: affiliate.affiliateId,
      businessName: affiliate.businessName
    } : 'undefined');
    logger.info('[sendAffiliateNewCustomerEmail] Customer:', customer ? {
      email: customer.email,
      firstName: customer.firstName,
      customerId: customer.customerId
    } : 'undefined');

    // Validate inputs
    if (!affiliate || !customer) {
      logger.error('Missing affiliate or customer data for new customer notification');
      return;
    }

    if (!affiliate.email) {
      logger.error('Affiliate email is missing or undefined');
      return;
    }
    const language = affiliate.languagePreference || 'en';
    const template = await loadTemplate('affiliate-new-customer', language);

    const numberOfBags = bagInfo.numberOfBags || 1;
    const totalCredit = bagInfo.totalCredit || 0;
    const isFreeRegistration = numberOfBags === 1 && totalCredit === 0;

    // Build the greeting with the actual business name
    const businessName = affiliate.businessName || `${affiliate.firstName} ${affiliate.lastName}`;

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: 'New Customer Registration',
        EMAIL_HEADER: 'New Customer Registration!',
        GREETING: `Congratulations, ${businessName}!`,
        NEW_CUSTOMER_MESSAGE: 'Great news! A new customer has just registered through your affiliate link.',
        ACTION_REQUIRED_LABEL: 'Action Required',
        ACTION_REQUIRED_MESSAGE: `Please deliver ${numberOfBags} laundry bag(s) to your new customer within 48 hours.`,
        BAG_FEE_NOTE: isFreeRegistration ?
          'Note: This customer received their first bag FREE as part of our promotional offer.' :
          'Note: The customer has been charged for their bags. This fee will be credited on their first order.',
        CUSTOMER_INFO_TITLE: 'Customer Information',
        CUSTOMER_ID_LABEL: 'Customer ID',
        NAME_LABEL: 'Name',
        EMAIL_LABEL: 'Email',
        PHONE_LABEL: 'Phone',
        ADDRESS_LABEL: 'Address',
        SERVICE_FREQUENCY_LABEL: 'Service Frequency',
        NEXT_STEPS_TITLE: 'Next Steps:',
        NEXT_STEPS_LIST: `<ol><li>Contact the customer to arrange bag delivery</li><li>Deliver <strong>${numberOfBags}</strong> laundry bag(s) they purchased during registration</li><li>Explain the pickup and delivery process</li><li>Schedule their first pickup if requested</li><li>Remind them that bag fees will be credited on their first order</li></ol>`,
        VIEW_CUSTOMER_BUTTON: 'View Customer in Dashboard',
        REMINDER_MESSAGE: 'Remember: Providing excellent service from the start helps ensure customer retention and positive reviews!',
        FOOTER_SENT_BY: `This email was sent by ${brand.displayName} Affiliate Program`,
        FOOTER_QUESTIONS: 'Questions? Contact us at',
        FOOTER_RIGHTS: 'All rights reserved.'
      },
      es: {
        EMAIL_TITLE: 'Nuevo Registro de Cliente',
        EMAIL_HEADER: '¡Nuevo Registro de Cliente!',
        GREETING: `¡Felicitaciones, ${businessName}!`,
        NEW_CUSTOMER_MESSAGE: '¡Excelentes noticias! Un nuevo cliente acaba de registrarse a través de su enlace de afiliado.',
        ACTION_REQUIRED_LABEL: 'Acción Requerida',
        ACTION_REQUIRED_MESSAGE: `Por favor entregue ${numberOfBags} bolsa(s) de lavandería a su nuevo cliente dentro de 48 horas.`,
        BAG_FEE_NOTE: isFreeRegistration ?
          'Nota: Este cliente recibió su primera bolsa GRATIS como parte de nuestra oferta promocional.' :
          'Nota: Al cliente se le ha cobrado por sus bolsas. Esta tarifa se acreditará en su primer pedido.',
        CUSTOMER_INFO_TITLE: 'Información del Cliente',
        CUSTOMER_ID_LABEL: 'ID del Cliente',
        NAME_LABEL: 'Nombre',
        EMAIL_LABEL: 'Correo Electrónico',
        PHONE_LABEL: 'Teléfono',
        ADDRESS_LABEL: 'Dirección',
        SERVICE_FREQUENCY_LABEL: 'Frecuencia de Servicio',
        NEXT_STEPS_TITLE: 'Próximos Pasos:',
        NEXT_STEPS_LIST: `<ol><li>Contacte al cliente para coordinar la entrega de bolsas</li><li>Entregue <strong>${numberOfBags}</strong> bolsa(s) de lavandería que compraron durante el registro</li><li>Explique el proceso de recogida y entrega</li><li>Programe su primera recogida si lo solicitan</li><li>Recuérdeles que las tarifas de bolsas se acreditarán en su primer pedido</li></ol>`,
        VIEW_CUSTOMER_BUTTON: 'Ver Cliente en el Panel',
        REMINDER_MESSAGE: 'Recuerde: ¡Brindar un excelente servicio desde el principio ayuda a garantizar la retención de clientes y reseñas positivas!',
        FOOTER_SENT_BY: `Este correo fue enviado por el Programa de Afiliados ${brand.displayName}`,
        FOOTER_QUESTIONS: '¿Preguntas? Contáctenos en',
        FOOTER_RIGHTS: 'Todos los derechos reservados.'
      },
      pt: {
        EMAIL_TITLE: 'Novo Registro de Cliente',
        EMAIL_HEADER: 'Novo Registro de Cliente!',
        GREETING: 'Parabéns, [BUSINESS_NAME]!',
        NEW_CUSTOMER_MESSAGE: 'Ótimas notícias! Um novo cliente acabou de se registrar através do seu link de afiliado.',
        ACTION_REQUIRED_LABEL: 'Ação Necessária',
        ACTION_REQUIRED_MESSAGE: `Por favor, entregue ${numberOfBags} sacola(s) de lavanderia ao seu novo cliente dentro de 48 horas.`,
        BAG_FEE_NOTE: isFreeRegistration ?
          'Nota: Este cliente recebeu sua primeira sacola GRÁTIS como parte de nossa oferta promocional.' :
          'Nota: O cliente foi cobrado pelas sacolas. Esta taxa será creditada no primeiro pedido.',
        CUSTOMER_INFO_TITLE: 'Informações do Cliente',
        CUSTOMER_ID_LABEL: 'ID do Cliente',
        NAME_LABEL: 'Nome',
        EMAIL_LABEL: 'E-mail',
        PHONE_LABEL: 'Telefone',
        ADDRESS_LABEL: 'Endereço',
        SERVICE_FREQUENCY_LABEL: 'Frequência de Serviço',
        NEXT_STEPS_TITLE: 'Próximos Passos:',
        NEXT_STEPS_LIST: `<ol><li>Entre em contato com o cliente para organizar a entrega das sacolas</li><li>Entregue <strong>${numberOfBags}</strong> sacola(s) de lavanderia que compraram durante o registro</li><li>Explique o processo de coleta e entrega</li><li>Agende a primeira coleta se solicitado</li><li>Lembre-os de que as taxas das sacolas serão creditadas no primeiro pedido</li></ol>`,
        VIEW_CUSTOMER_BUTTON: 'Ver Cliente no Painel',
        REMINDER_MESSAGE: 'Lembre-se: Fornecer um excelente serviço desde o início ajuda a garantir a retenção de clientes e avaliações positivas!',
        FOOTER_SENT_BY: `Este e-mail foi enviado pelo Programa de Afiliados ${brand.displayName}`,
        FOOTER_QUESTIONS: 'Dúvidas? Entre em contato conosco em',
        FOOTER_RIGHTS: 'Todos os direitos reservados.'
      },
      de: {
        EMAIL_TITLE: 'Neue Kundenregistrierung',
        EMAIL_HEADER: 'Neue Kundenregistrierung!',
        GREETING: 'Herzlichen Glückwunsch, [BUSINESS_NAME]!',
        NEW_CUSTOMER_MESSAGE: 'Großartige Neuigkeiten! Ein neuer Kunde hat sich gerade über Ihren Affiliate-Link registriert.',
        ACTION_REQUIRED_LABEL: 'Aktion erforderlich',
        ACTION_REQUIRED_MESSAGE: `Bitte liefern Sie ${numberOfBags} Wäschesack/-säcke innerhalb von 48 Stunden an Ihren neuen Kunden.`,
        BAG_FEE_NOTE: isFreeRegistration ?
          'Hinweis: Dieser Kunde hat seinen ersten Sack KOSTENLOS als Teil unseres Werbeangebots erhalten.' :
          'Hinweis: Dem Kunden wurden die Säcke berechnet. Diese Gebühr wird bei der ersten Bestellung gutgeschrieben.',
        CUSTOMER_INFO_TITLE: 'Kundeninformationen',
        CUSTOMER_ID_LABEL: 'Kunden-ID',
        NAME_LABEL: 'Name',
        EMAIL_LABEL: 'E-Mail',
        PHONE_LABEL: 'Telefon',
        ADDRESS_LABEL: 'Adresse',
        SERVICE_FREQUENCY_LABEL: 'Service-Häufigkeit',
        NEXT_STEPS_TITLE: 'Nächste Schritte:',
        NEXT_STEPS_LIST: `<ol><li>Kontaktieren Sie den Kunden, um die Sacklieferung zu arrangieren</li><li>Liefern Sie <strong>${numberOfBags}</strong> Wäschesack/-säcke, die während der Registrierung gekauft wurden</li><li>Erklären Sie den Abhol- und Lieferprozess</li><li>Planen Sie die erste Abholung auf Anfrage</li><li>Erinnern Sie sie daran, dass die Sackgebühren bei der ersten Bestellung gutgeschrieben werden</li></ol>`,
        VIEW_CUSTOMER_BUTTON: 'Kunde im Dashboard anzeigen',
        REMINDER_MESSAGE: 'Denken Sie daran: Exzellenter Service von Anfang an hilft, Kundenbindung und positive Bewertungen zu gewährleisten!',
        FOOTER_SENT_BY: `Diese E-Mail wurde vom ${brand.displayName} Affiliate-Programm gesendet`,
        FOOTER_QUESTIONS: 'Fragen? Kontaktieren Sie uns unter',
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      business_name: affiliate.businessName || affiliate.firstName || 'Affiliate',
      BUSINESS_NAME: affiliate.businessName || affiliate.firstName || 'Affiliate',
      affiliate_first_name: affiliate.firstName,
      affiliate_name: affiliate.businessName || `${affiliate.firstName} ${affiliate.lastName}`,
      customer_first_name: customer.firstName,
      customer_last_name: customer.lastName,
      customer_name: `${customer.firstName} ${customer.lastName}`,
      customer_id: customer.customerId,
      customer_email: customer.email,
      customer_phone: customer.phone,
      customer_address: `${customer.address}, ${customer.city}, ${customer.state} ${customer.zipCode}`,
      service_frequency: customer.serviceFrequency,
      number_of_bags: numberOfBags,
      dashboard_url: `https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program?login=affiliate&customer=${customer.customerId}`,
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: 'New Customer Registration',
      es: 'Nuevo Registro de Cliente',
      pt: 'Novo Registro de Cliente',
      de: 'Neue Kundenregistrierung'
    };
    const subject = subjects[language] || subjects.en;

    await sendEmail(
      affiliate.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending new customer notification email:', error);
  }
};

/**
 * Send new order notification to affiliate
 */
exports.sendAffiliateNewOrderEmail = async (affiliate, customer, order) => {
  try {
    const language = affiliate.languagePreference || 'en';
    const template = await loadTemplate('affiliate-new-order', language);

    // Build the greeting with fallback
    const affiliateName = affiliate.firstName || affiliate.businessName || 'Partner';

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: 'New Laundry Pickup Order',
        EMAIL_HEADER: 'New Laundry Pickup Order',
        GREETING: `Hello ${affiliateName},`,
        NEW_ORDER_MESSAGE: 'You have a new laundry pickup order to process!',
        ORDER_DETAILS_TITLE: 'Order Details',
        ORDER_ID_LABEL: 'Order ID',
        CUSTOMER_LABEL: 'Customer',
        PHONE_LABEL: 'Phone',
        ADDRESS_LABEL: 'Address',
        PICKUP_DATE_LABEL: 'Pickup Date',
        PICKUP_TIME_LABEL: 'Pickup Time',
        ESTIMATED_WEIGHT_LABEL: 'Estimated Weight',
        NUMBER_OF_BAGS_LABEL: 'Number of Bags',
        SPECIAL_INSTRUCTIONS_LABEL: 'Special Instructions',
        VIEW_ORDER_BUTTON: 'View in Dashboard',
        PICKUP_REMINDER: 'A customer has started a laundry order for one of your bags. Please coordinate the pickup with them.',
        CLOSING_MESSAGE: `Best regards,<br>The ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_AUTOMATED_MESSAGE: 'This is an automated message. Please do not reply to this email.'
      },
      es: {
        EMAIL_TITLE: 'Nuevo Pedido de Recogida de Lavandería',
        EMAIL_HEADER: 'Nuevo Pedido de Recogida de Lavandería',
        GREETING: `Hola ${affiliateName},`,
        NEW_ORDER_MESSAGE: '¡Tiene un nuevo pedido de recogida de lavandería para procesar!',
        ORDER_DETAILS_TITLE: 'Detalles del Pedido',
        ORDER_ID_LABEL: 'ID del Pedido',
        CUSTOMER_LABEL: 'Cliente',
        PHONE_LABEL: 'Teléfono',
        ADDRESS_LABEL: 'Dirección',
        PICKUP_DATE_LABEL: 'Fecha de Recogida',
        PICKUP_TIME_LABEL: 'Hora de Recogida',
        ESTIMATED_WEIGHT_LABEL: 'Peso Estimado',
        NUMBER_OF_BAGS_LABEL: 'Número de Bolsas',
        SPECIAL_INSTRUCTIONS_LABEL: 'Instrucciones Especiales',
        VIEW_ORDER_BUTTON: 'Ver en el Panel',
        PICKUP_REMINDER: 'Un cliente ha iniciado un pedido de lavandería para una de sus bolsas. Por favor, coordine la recogida con él.',
        CLOSING_MESSAGE: `Saludos cordiales,<br>El Equipo de ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este es un mensaje automatizado. Por favor no responda a este correo.'
      },
      pt: {
        EMAIL_TITLE: 'Novo Pedido de Coleta de Lavanderia',
        EMAIL_HEADER: 'Novo Pedido de Coleta de Lavanderia',
        GREETING: `Olá ${affiliateName},`,
        NEW_ORDER_MESSAGE: 'Você tem um novo pedido de coleta de lavanderia para processar!',
        ORDER_DETAILS_TITLE: 'Detalhes do Pedido',
        ORDER_ID_LABEL: 'ID do Pedido',
        CUSTOMER_LABEL: 'Cliente',
        PHONE_LABEL: 'Telefone',
        ADDRESS_LABEL: 'Endereço',
        PICKUP_DATE_LABEL: 'Data de Coleta',
        PICKUP_TIME_LABEL: 'Hora de Coleta',
        ESTIMATED_WEIGHT_LABEL: 'Peso Estimado',
        NUMBER_OF_BAGS_LABEL: 'Número de Sacolas',
        SPECIAL_INSTRUCTIONS_LABEL: 'Instruções Especiais',
        VIEW_ORDER_BUTTON: 'Ver no Painel',
        PICKUP_REMINDER: 'Um cliente iniciou um pedido de lavanderia para uma de suas sacolas. Por favor, combine a coleta com ele.',
        CLOSING_MESSAGE: `Atenciosamente,<br>A Equipe ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Esta é uma mensagem automatizada. Por favor, não responda a este e-mail.'
      },
      de: {
        EMAIL_TITLE: 'Neue Wäscheabhol-Bestellung',
        EMAIL_HEADER: 'Neue Wäscheabhol-Bestellung',
        GREETING: `Hallo ${affiliateName},`,
        NEW_ORDER_MESSAGE: 'Sie haben eine neue Wäscheabhol-Bestellung zu bearbeiten!',
        ORDER_DETAILS_TITLE: 'Bestelldetails',
        ORDER_ID_LABEL: 'Bestell-ID',
        CUSTOMER_LABEL: 'Kunde',
        PHONE_LABEL: 'Telefon',
        ADDRESS_LABEL: 'Adresse',
        PICKUP_DATE_LABEL: 'Abholdatum',
        PICKUP_TIME_LABEL: 'Abholzeit',
        ESTIMATED_WEIGHT_LABEL: 'Geschätztes Gewicht',
        NUMBER_OF_BAGS_LABEL: 'Anzahl der Säcke',
        SPECIAL_INSTRUCTIONS_LABEL: 'Besondere Anweisungen',
        VIEW_ORDER_BUTTON: 'Im Dashboard anzeigen',
        PICKUP_REMINDER: 'Ein Kunde hat eine Wäschebestellung für einen Ihrer Beutel gestartet. Bitte stimmen Sie die Abholung mit ihm ab.',
        CLOSING_MESSAGE: `Mit freundlichen Grüßen,<br>Das ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_AUTOMATED_MESSAGE: 'Dies ist eine automatisierte Nachricht. Bitte antworten Sie nicht auf diese E-Mail.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    // Phase 1 slim model: no pickup date/time, weight, bag count, or special
    // instructions (those lived in the removed scheduling/pricing flow). The
    // affiliate just needs to know a customer started an order for this bag.
    const data = {
      affiliate_first_name: affiliate.firstName,
      order_id: order.orderId,
      customer_name: `${customer.firstName} ${customer.lastName}`,
      customer_phone: customer.phone,
      customer_address: `${customer.address}, ${customer.city}, ${customer.state} ${customer.zipCode}`,
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: 'New Laundry Pickup Order',
      es: 'Nuevo Pedido de Recogida de Lavandería',
      pt: 'Novo Pedido de Coleta de Lavanderia',
      de: 'Neue Wäscheabhol-Bestellung'
    };
    const subject = subjects[language] || subjects.en;

    await sendEmail(
      affiliate.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending new order notification email:', error);
  }
};

/**
 * @deprecated DEAD CODE since 2026-06-20. The affiliate is now emailed only ONCE
 * — when an order starts (sendAffiliateNewOrderEmail) — because partners manage
 * their own pickup schedule. notifyTransition no longer calls this at
 * out_for_delivery. Kept (unwired) to avoid template/test churn; safe to delete
 * with affiliate-order-ready.html next cleanup.
 */
exports.sendAffiliateOrderReadyEmail = async (affiliate, order, customer) => {
  try {
    const language = affiliate.languagePreference || 'en';
    const template = await loadTemplate('affiliate-order-ready', language);
    const affiliateName = affiliate.firstName || affiliate.businessName || 'Partner';
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : '';

    const translations = {
      en: {
        EMAIL_TITLE: 'Order Ready for Pickup',
        EMAIL_HEADER: 'Order Ready for Pickup',
        GREETING: `Hello ${affiliateName},`,
        READY_MESSAGE: 'An order has been processed and is ready for pickup at the store.',
        ORDER_ID_LABEL: 'Order ID',
        CUSTOMER_LABEL: 'Customer',
        CLOSING_MESSAGE: `Best regards,<br>The ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_AUTOMATED_MESSAGE: 'This is an automated message. Please do not reply to this email.'
      },
      es: {
        EMAIL_TITLE: 'Pedido Listo para Recoger',
        EMAIL_HEADER: 'Pedido Listo para Recoger',
        GREETING: `Hola ${affiliateName},`,
        READY_MESSAGE: 'Un pedido ha sido procesado y está listo para recoger en la tienda.',
        ORDER_ID_LABEL: 'ID del Pedido',
        CUSTOMER_LABEL: 'Cliente',
        CLOSING_MESSAGE: `Saludos cordiales,<br>El Equipo de ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este es un mensaje automatizado. Por favor no responda a este correo.'
      },
      pt: {
        EMAIL_TITLE: 'Pedido Pronto para Coleta',
        EMAIL_HEADER: 'Pedido Pronto para Coleta',
        GREETING: `Olá ${affiliateName},`,
        READY_MESSAGE: 'Um pedido foi processado e está pronto para coleta na loja.',
        ORDER_ID_LABEL: 'ID do Pedido',
        CUSTOMER_LABEL: 'Cliente',
        CLOSING_MESSAGE: `Atenciosamente,<br>A Equipe ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Esta é uma mensagem automatizada. Por favor, não responda a este e-mail.'
      },
      de: {
        EMAIL_TITLE: 'Bestellung zur Abholung bereit',
        EMAIL_HEADER: 'Bestellung zur Abholung bereit',
        GREETING: `Hallo ${affiliateName},`,
        READY_MESSAGE: 'Eine Bestellung wurde bearbeitet und ist im Geschäft zur Abholung bereit.',
        ORDER_ID_LABEL: 'Bestell-ID',
        CUSTOMER_LABEL: 'Kunde',
        CLOSING_MESSAGE: `Mit freundlichen Grüßen,<br>Das ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_AUTOMATED_MESSAGE: 'Dies ist eine automatisierte Nachricht. Bitte antworten Sie nicht auf diese E-Mail.'
      }
    };
    const emailTranslations = translations[language] || translations.en;

    const html = fillTemplate(template, {
      order_id: order.orderId,
      customer_name: customerName,
      current_year: new Date().getFullYear(),
      ...emailTranslations
    });

    await sendEmail(affiliate.email, emailTranslations.EMAIL_TITLE, html);
  } catch (error) {
    logger.error('Error sending affiliate order-ready email:', error);
  }
};

/**
 * Send order cancellation notification to affiliate
 */
exports.sendAffiliateOrderCancellationEmail = async (affiliate, order, customer) => {
  try {
    const language = affiliate.languagePreference || 'en';
    const template = await loadTemplate('affiliate-order-cancelled', language);

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: 'Order Cancelled',
        EMAIL_HEADER: 'Order Cancelled',
        GREETING: `Hello ${affiliate.firstName},`,
        CANCELLATION_MESSAGE: 'We wanted to inform you that an order has been cancelled.',
        CANCELLATION_DETAILS_TITLE: 'Cancellation Details',
        ORDER_ID_LABEL: 'Order ID',
        CUSTOMER_LABEL: 'Customer',
        CANCELLED_AT_LABEL: 'Cancelled At',
        VIEW_DASHBOARD_BUTTON: 'View Dashboard',
        DO_NOT_PROCEED_MESSAGE: 'Please do not proceed with this pickup. The customer may reschedule at a later time.',
        CLOSING_MESSAGE: `Best regards,<br>The ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_AUTOMATED_MESSAGE: 'This is an automated message. Please do not reply to this email.'
      },
      es: {
        EMAIL_TITLE: 'Pedido Cancelado',
        EMAIL_HEADER: 'Pedido Cancelado',
        GREETING: `Hola ${affiliate.firstName},`,
        CANCELLATION_MESSAGE: 'Queremos informarle que un pedido ha sido cancelado.',
        CANCELLATION_DETAILS_TITLE: 'Detalles de Cancelación',
        ORDER_ID_LABEL: 'ID del Pedido',
        CUSTOMER_LABEL: 'Cliente',
        CANCELLED_AT_LABEL: 'Cancelado a las',
        VIEW_DASHBOARD_BUTTON: 'Ver Panel',
        DO_NOT_PROCEED_MESSAGE: 'Por favor no proceda con esta recogida. El cliente puede reprogramar en otro momento.',
        CLOSING_MESSAGE: `Saludos cordiales,<br>El Equipo de ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este es un mensaje automatizado. Por favor no responda a este correo.'
      },
      pt: {
        EMAIL_TITLE: 'Pedido Cancelado',
        EMAIL_HEADER: 'Pedido Cancelado',
        GREETING: `Olá ${affiliate.firstName},`,
        CANCELLATION_MESSAGE: 'Gostaríamos de informar que um pedido foi cancelado.',
        CANCELLATION_DETAILS_TITLE: 'Detalhes do Cancelamento',
        ORDER_ID_LABEL: 'ID do Pedido',
        CUSTOMER_LABEL: 'Cliente',
        CANCELLED_AT_LABEL: 'Cancelado às',
        VIEW_DASHBOARD_BUTTON: 'Ver Painel',
        DO_NOT_PROCEED_MESSAGE: 'Por favor, não prossiga com esta coleta. O cliente pode reagendar posteriormente.',
        CLOSING_MESSAGE: `Atenciosamente,<br>A Equipe ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Esta é uma mensagem automatizada. Por favor, não responda a este e-mail.'
      },
      de: {
        EMAIL_TITLE: 'Bestellung storniert',
        EMAIL_HEADER: 'Bestellung storniert',
        GREETING: `Hallo ${affiliate.firstName},`,
        CANCELLATION_MESSAGE: 'Wir möchten Sie darüber informieren, dass eine Bestellung storniert wurde.',
        CANCELLATION_DETAILS_TITLE: 'Stornierungsdetails',
        ORDER_ID_LABEL: 'Bestell-ID',
        CUSTOMER_LABEL: 'Kunde',
        CANCELLED_AT_LABEL: 'Storniert um',
        VIEW_DASHBOARD_BUTTON: 'Dashboard anzeigen',
        DO_NOT_PROCEED_MESSAGE: 'Bitte fahren Sie nicht mit dieser Abholung fort. Der Kunde kann zu einem späteren Zeitpunkt neu planen.',
        CLOSING_MESSAGE: `Mit freundlichen Grüßen,<br>Das ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_AUTOMATED_MESSAGE: 'Dies ist eine automatisierte Nachricht. Bitte antworten Sie nicht auf diese E-Mail.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      affiliate_first_name: affiliate.firstName,
      order_id: order.orderId,
      customer_name: `${customer.firstName} ${customer.lastName}`,
      cancellation_time: new Date().toLocaleTimeString(),
      dashboard_url: 'https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program?login=affiliate',
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: 'Order Cancelled',
      es: 'Pedido Cancelado',
      pt: 'Pedido Cancelado',
      de: 'Bestellung storniert'
    };
    const subject = subjects[language] || subjects.en;

    await sendEmail(
      affiliate.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending order cancellation email:', error);
  }
};

/**
 * Send password reset email to affiliate
 */
exports.sendAffiliatePasswordResetEmail = async (affiliate, resetUrl) => {
  try {
    const template = await loadTemplate('affiliate-password-reset');

    const data = {
      first_name: affiliate.firstName,
      affiliate_id: affiliate.affiliateId,
      reset_url: resetUrl,
      expire_time: '1 hour',
      current_year: new Date().getFullYear()
    };

    const html = fillTemplate(template, data);

    await sendEmail(
      affiliate.email,
      `Password Reset Request - ${brand.displayName} Affiliate Portal`,
      html
    );
  } catch (error) {
    logger.error('Error sending affiliate password reset email:', error);
  }
};

module.exports = exports;
