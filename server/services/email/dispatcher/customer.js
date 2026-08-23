const logger = require('../../../utils/logger');
// Customer-facing email dispatchers.
// Extracted from utils/emailService.js in Phase 2.

const { loadTemplate, fillTemplate, formatTimeSlot } = require('../template-manager');
const { sendEmail } = require('../transport');
const brand = require('../../../config/brand');
// =============================================================================
// Customer Emails
// =============================================================================

// Escape user/affiliate-supplied text before embedding it in HTML email.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Localized add-on label: the customer's language translation, else English name.
function addOnLabel(a, language) {
  if (language && language !== 'en' && a.translations && a.translations[language]) {
    return a.translations[language];
  }
  return a.name || a.key;
}

/**
 * Build the [EXTRA_BLOCK] HTML for the customer order-status email.
 * - 'pending' (order started): pickup instructions + delivery fee (if > 0) +
 *   selected paid add-ons (label + price).
 * - 'out_for_delivery': the affiliate's delivery instructions.
 * Returns '' when there's nothing to show (placeholder collapses cleanly).
 * @param {string} status
 * @param {{pickupInstructions?:string, deliveryInstructions?:string, deliveryFee?:number, addOns?:Array}} opts
 * @param {Object} L - resolved translation labels for the active language
 * @param {string} language
 * @returns {string} HTML
 */
function buildOrderExtraBlock(status, opts = {}, L = {}, language = 'en') {
  const rows = [];
  const rowStyle = 'margin: 10px 0;';
  const labelStyle = 'font-weight: bold; color: #555;';

  if (status === 'pending') {
    if (opts.pickupInstructions && String(opts.pickupInstructions).trim()) {
      rows.push(`<div style="${rowStyle}"><span style="${labelStyle}">${escapeHtml(L.PICKUP_INSTRUCTIONS_LABEL)}:</span><br>${escapeHtml(opts.pickupInstructions)}</div>`);
    }
    if (Number(opts.deliveryFee) > 0) {
      rows.push(`<div style="${rowStyle}"><span style="${labelStyle}">${escapeHtml(L.DELIVERY_FEE_LABEL)}:</span> $${Number(opts.deliveryFee).toFixed(2)}</div>`);
    }
    const paid = Array.isArray(opts.addOns) ? opts.addOns.filter(a => Number(a.price) > 0) : [];
    if (paid.length) {
      const items = paid
        .map(a => `<li>${escapeHtml(addOnLabel(a, language))} — $${Number(a.price).toFixed(2)}${a.priceUnit === 'per_lb' ? '/lb' : ''}</li>`)
        .join('');
      rows.push(`<div style="${rowStyle}"><span style="${labelStyle}">${escapeHtml(L.PREMIUM_OPTIONS_LABEL)}:</span><ul style="margin: 6px 0 0; padding-left: 20px;">${items}</ul></div>`);
    }
  } else if (status === 'out_for_delivery') {
    if (opts.deliveryInstructions && String(opts.deliveryInstructions).trim()) {
      rows.push(`<div style="${rowStyle}"><span style="${labelStyle}">${escapeHtml(L.DELIVERY_INSTRUCTIONS_LABEL)}:</span><br>${escapeHtml(opts.deliveryInstructions)}</div>`);
    }
  }

  if (!rows.length) return '';
  return `<div class="status-update" style="background-color: #f1f8e9; border: 1px solid #8bc34a;">${rows.join('')}</div>`;
}

/**
 * Send welcome email to a new customer
 */
exports.sendCustomerWelcomeEmail = async (customer, affiliate, bagInfo = {}) => {
  try {
    // Debug logging
    logger.info('[sendCustomerWelcomeEmail] Customer:', customer ? {
      email: customer.email,
      firstName: customer.firstName,
      customerId: customer.customerId
    } : 'undefined');
    logger.info('[sendCustomerWelcomeEmail] Affiliate:', affiliate ? {
      affiliateId: affiliate.affiliateId,
      businessName: affiliate.businessName
    } : 'undefined');

    // Validate inputs
    if (!customer || !affiliate) {
      logger.error('Missing customer or affiliate data for welcome email');
      return;
    }

    if (!customer.email) {
      // Email is required at registration (2026-06-18); this is a defensive
      // fallback for legacy/no-email records only — nothing to send.
      logger.info('Skipping customer welcome email — no email on file');
      return;
    }

    const language = customer.languagePreference || 'en';
    const template = await loadTemplate('customer-welcome', language);

    // Build affiliate name with fallback
    const affiliateName = affiliate.businessName ||
      `${affiliate.firstName || ''} ${affiliate.lastName || ''}`.trim() ||
      `Your ${brand.displayName} Partner`;

    // The bag's claim URL drives the "Request a pickup" button — and is exactly
    // what the QR on the bag encodes, so tapping the button OR scanning the bag
    // both land the customer on the order-start (enter registered phone).
    const baseUrl = process.env.BASE_URL || 'https://rundberglaundry.com';
    const pickupUrl = bagInfo.bagToken
      ? `${baseUrl}/embed-app-v2.html?route=/claim&bag=${encodeURIComponent(bagInfo.bagToken)}`
      : `${baseUrl}/embed-app-v2.html?route=/claim`;
    // Confirm-email link — clicking it verifies ownership and turns on order
    // notifications. Single-use; the raw token lives only in this link.
    const verifyUrl = bagInfo.emailVerifyToken
      ? `${baseUrl}/api/v1/customers/verify-email/${encodeURIComponent(bagInfo.emailVerifyToken)}`
      : '';

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: `Welcome to ${brand.displayName} Service`,
        EMAIL_HEADER: `Welcome to ${brand.displayName}!`,
        GREETING: `Hi ${customer.firstName},`,
        WELCOME_MESSAGE: 'Your bag is registered and your account is ready. Whenever you have laundry to send, just request a pickup.',
        CONFIRM_EMAIL_TITLE: 'Confirm your email',
        CONFIRM_EMAIL_MESSAGE: 'Confirm your email so we can send you order updates. Until you confirm, we won\'t email you.',
        CONFIRM_EMAIL_BUTTON: 'Confirm your email',
        YOUR_INFO_TITLE: 'Your Account',
        CUSTOMER_ID_LABEL: 'Customer ID',
        SERVICE_PROVIDER_LABEL: 'Your Service Provider',
        PICKUP_BUTTON: 'Request a pickup',
        HOW_TO_START_TITLE: 'How to start an order',
        HOW_TO_START_MESSAGE: 'Tap "Request a pickup" above, or scan the QR code on your bag and enter your registered phone number.',
        QUESTIONS_TITLE: 'Questions?',
        QUESTIONS_MESSAGE: 'Your service provider is here to help:',
        NAME_LABEL: 'Name',
        PHONE_LABEL: 'Phone',
        EMAIL_LABEL: 'Email',
        FOOTER_SUPPORT: 'If you have any questions, please contact your service provider.',
        FOOTER_RIGHTS: 'All rights reserved.'
      },
      es: {
        EMAIL_TITLE: `Bienvenido al Servicio de Lavandería ${brand.displayName}`,
        EMAIL_HEADER: `¡Bienvenido a ${brand.displayName}!`,
        GREETING: `Hola ${customer.firstName},`,
        WELCOME_MESSAGE: 'Su bolsa está registrada y su cuenta está lista. Cuando tenga ropa para enviar, solo solicite una recogida.',
        CONFIRM_EMAIL_TITLE: 'Confirme su correo electrónico',
        CONFIRM_EMAIL_MESSAGE: 'Confirme su correo para que podamos enviarle actualizaciones de su pedido. Hasta que confirme, no le enviaremos correos.',
        CONFIRM_EMAIL_BUTTON: 'Confirmar correo',
        YOUR_INFO_TITLE: 'Su Cuenta',
        CUSTOMER_ID_LABEL: 'ID de Cliente',
        SERVICE_PROVIDER_LABEL: 'Su Proveedor de Servicio',
        PICKUP_BUTTON: 'Solicitar una recogida',
        HOW_TO_START_TITLE: 'Cómo iniciar un pedido',
        HOW_TO_START_MESSAGE: 'Toque "Solicitar una recogida" arriba, o escanee el código QR de su bolsa e ingrese su número de teléfono registrado.',
        QUESTIONS_TITLE: '¿Preguntas?',
        QUESTIONS_MESSAGE: 'Su proveedor de servicio está aquí para ayudar:',
        NAME_LABEL: 'Nombre',
        PHONE_LABEL: 'Teléfono',
        EMAIL_LABEL: 'Correo',
        FOOTER_SUPPORT: 'Si tiene alguna pregunta, contacte a su proveedor de servicio.',
        FOOTER_RIGHTS: 'Todos los derechos reservados.'
      },
      pt: {
        EMAIL_TITLE: `Bem-vindo ao Serviço de Lavanderia ${brand.displayName}`,
        EMAIL_HEADER: `Bem-vindo ao ${brand.displayName}!`,
        GREETING: `Olá ${customer.firstName},`,
        WELCOME_MESSAGE: 'Sua sacola está registrada e sua conta está pronta. Sempre que tiver roupas para enviar, basta solicitar uma coleta.',
        CONFIRM_EMAIL_TITLE: 'Confirme seu e-mail',
        CONFIRM_EMAIL_MESSAGE: 'Confirme seu e-mail para que possamos enviar atualizações do seu pedido. Até confirmar, não enviaremos e-mails.',
        CONFIRM_EMAIL_BUTTON: 'Confirmar e-mail',
        YOUR_INFO_TITLE: 'Sua Conta',
        CUSTOMER_ID_LABEL: 'ID do Cliente',
        SERVICE_PROVIDER_LABEL: 'Seu Provedor de Serviço',
        PICKUP_BUTTON: 'Solicitar uma coleta',
        HOW_TO_START_TITLE: 'Como iniciar um pedido',
        HOW_TO_START_MESSAGE: 'Toque em "Solicitar uma coleta" acima, ou escaneie o código QR da sua sacola e insira seu número de telefone registrado.',
        QUESTIONS_TITLE: 'Dúvidas?',
        QUESTIONS_MESSAGE: 'Seu provedor de serviço está aqui para ajudar:',
        NAME_LABEL: 'Nome',
        PHONE_LABEL: 'Telefone',
        EMAIL_LABEL: 'E-mail',
        FOOTER_SUPPORT: 'Se você tiver alguma dúvida, entre em contato com seu provedor de serviço.',
        FOOTER_RIGHTS: 'Todos os direitos reservados.'
      },
      de: {
        EMAIL_TITLE: `Willkommen beim ${brand.displayName} Wäscheservice`,
        EMAIL_HEADER: `Willkommen bei ${brand.displayName}!`,
        GREETING: `Hallo ${customer.firstName},`,
        WELCOME_MESSAGE: 'Ihr Beutel ist registriert und Ihr Konto ist bereit. Wann immer Sie Wäsche zu senden haben, fordern Sie einfach eine Abholung an.',
        CONFIRM_EMAIL_TITLE: 'Bestätigen Sie Ihre E-Mail',
        CONFIRM_EMAIL_MESSAGE: 'Bestätigen Sie Ihre E-Mail, damit wir Ihnen Bestellaktualisierungen senden können. Bis zur Bestätigung senden wir keine E-Mails.',
        CONFIRM_EMAIL_BUTTON: 'E-Mail bestätigen',
        YOUR_INFO_TITLE: 'Ihr Konto',
        CUSTOMER_ID_LABEL: 'Kunden-ID',
        SERVICE_PROVIDER_LABEL: 'Ihr Dienstleister',
        PICKUP_BUTTON: 'Abholung anfordern',
        HOW_TO_START_TITLE: 'So starten Sie eine Bestellung',
        HOW_TO_START_MESSAGE: 'Tippen Sie oben auf "Abholung anfordern" oder scannen Sie den QR-Code auf Ihrem Beutel und geben Sie Ihre registrierte Telefonnummer ein.',
        QUESTIONS_TITLE: 'Fragen?',
        QUESTIONS_MESSAGE: 'Ihr Dienstleister hilft Ihnen gerne:',
        NAME_LABEL: 'Name',
        PHONE_LABEL: 'Telefon',
        EMAIL_LABEL: 'E-Mail',
        FOOTER_SUPPORT: 'Bei Fragen wenden Sie sich bitte an Ihren Dienstleister.',
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      first_name: customer.firstName || '',
      last_name: customer.lastName || '',
      customer_id: customer.customerId || '',
      affiliate_name: affiliateName,
      affiliate_phone: affiliate.phone || 'Contact for details',
      affiliate_email: affiliate.email || 'support@rundberglaundry.com',
      pickup_url: pickupUrl,
      verify_url: verifyUrl,
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: `Welcome to ${brand.displayName} Service`,
      es: `Bienvenido al Servicio de Lavandería ${brand.displayName}`,
      pt: `Bem-vindo ao Serviço de Lavanderia ${brand.displayName}`,
      de: `Willkommen beim ${brand.displayName} Wäscheservice`
    };
    const subject = subjects[language] || subjects.en;

    // No attachments - using linked logo in HTML
    await sendEmail(
      customer.email,
      subject,
      html
    );

    logger.info('Customer welcome email sent successfully to:', customer.email);
  } catch (error) {
    logger.error('Error sending customer welcome email:', error);
    throw error; // Re-throw to let the controller handle it
  }
};

/**
 * Send order status update email to customer
 */
exports.sendOrderStatusUpdateEmail = async (customer, order, status, opts = {}) => {
  try {
    const language = customer.languagePreference || 'en';
    const template = await loadTemplate('customer-order-status', language);

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: 'Order Status Update',
        EMAIL_HEADER: 'Order Status Update',
        GREETING: `Hello ${customer.firstName},`,
        UPDATE_MESSAGE: 'We have an update on your laundry order!',
        STATUS_UPDATE_TITLE: 'Status Update',
        ORDER_ID_LABEL: 'Order ID',
        STATUS_LABEL: 'Status',
        PICKUP_INSTRUCTIONS_LABEL: 'Pickup instructions',
        DELIVERY_INSTRUCTIONS_LABEL: 'Delivery instructions',
        DELIVERY_FEE_LABEL: 'Delivery fee',
        PREMIUM_OPTIONS_LABEL: 'Premium options',
        THANK_YOU_MESSAGE: `Thank you for choosing ${brand.displayName}!`,
        CLOSING_MESSAGE: `Best regards,<br>The ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_AUTOMATED_MESSAGE: 'This is an automated message. Please do not reply to this email.',
        STATUS_MESSAGES: {
          pending: 'Your order has been created',
          in_progress: 'Your laundry has been received and is being processed',
          out_for_delivery: 'Your laundry is on its way back to you',
          complete: 'Your laundry has been delivered'
        },
        STATUS_TITLES: {
          pending: 'Order Created',
          in_progress: 'Laundry Processing',
          out_for_delivery: 'Out for Delivery',
          complete: 'Order Complete'
        }
      },
      es: {
        EMAIL_TITLE: 'Actualización del Estado del Pedido',
        EMAIL_HEADER: 'Actualización del Estado del Pedido',
        GREETING: `Hola ${customer.firstName},`,
        UPDATE_MESSAGE: '¡Tenemos una actualización sobre su pedido de lavandería!',
        STATUS_UPDATE_TITLE: 'Actualización de Estado',
        ORDER_ID_LABEL: 'ID del Pedido',
        STATUS_LABEL: 'Estado',
        PICKUP_INSTRUCTIONS_LABEL: 'Instrucciones de recogida',
        DELIVERY_INSTRUCTIONS_LABEL: 'Instrucciones de entrega',
        DELIVERY_FEE_LABEL: 'Tarifa de entrega',
        PREMIUM_OPTIONS_LABEL: 'Opciones premium',
        THANK_YOU_MESSAGE: `¡Gracias por elegir ${brand.displayName}!`,
        CLOSING_MESSAGE: `Saludos cordiales,<br>El Equipo de ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este es un mensaje automatizado. Por favor no responda a este correo.',
        STATUS_MESSAGES: {
          pending: 'Su pedido ha sido creado',
          in_progress: 'Su ropa ha sido recibida y está siendo procesada',
          out_for_delivery: 'Su ropa está en camino de regreso a usted',
          complete: 'Su ropa ha sido entregada'
        },
        STATUS_TITLES: {
          pending: 'Pedido Creado',
          in_progress: 'Procesando Ropa',
          out_for_delivery: 'En Camino',
          complete: 'Pedido Completo'
        }
      },
      pt: {
        EMAIL_TITLE: 'Atualização do Status do Pedido',
        EMAIL_HEADER: 'Atualização do Status do Pedido',
        GREETING: `Olá ${customer.firstName},`,
        UPDATE_MESSAGE: 'Temos uma atualização sobre seu pedido de lavanderia!',
        STATUS_UPDATE_TITLE: 'Atualização de Status',
        ORDER_ID_LABEL: 'ID do Pedido',
        STATUS_LABEL: 'Status',
        PICKUP_INSTRUCTIONS_LABEL: 'Instruções de coleta',
        DELIVERY_INSTRUCTIONS_LABEL: 'Instruções de entrega',
        DELIVERY_FEE_LABEL: 'Taxa de entrega',
        PREMIUM_OPTIONS_LABEL: 'Opções premium',
        THANK_YOU_MESSAGE: `Obrigado por escolher ${brand.displayName}!`,
        CLOSING_MESSAGE: `Atenciosamente,<br>A Equipe ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Esta é uma mensagem automatizada. Por favor, não responda a este e-mail.',
        STATUS_MESSAGES: {
          pending: 'Seu pedido foi criado',
          in_progress: 'Sua roupa foi recebida e está sendo processada',
          out_for_delivery: 'Sua roupa está a caminho de volta para você',
          complete: 'Sua roupa foi entregue'
        },
        STATUS_TITLES: {
          pending: 'Pedido Criado',
          in_progress: 'Processando Roupa',
          out_for_delivery: 'A Caminho',
          complete: 'Pedido Completo'
        }
      },
      de: {
        EMAIL_TITLE: 'Bestellstatus-Update',
        EMAIL_HEADER: 'Bestellstatus-Update',
        GREETING: `Hallo ${customer.firstName},`,
        UPDATE_MESSAGE: 'Wir haben ein Update zu Ihrer Wäschebestellung!',
        STATUS_UPDATE_TITLE: 'Status-Update',
        ORDER_ID_LABEL: 'Bestell-ID',
        STATUS_LABEL: 'Status',
        PICKUP_INSTRUCTIONS_LABEL: 'Abholhinweise',
        DELIVERY_INSTRUCTIONS_LABEL: 'Lieferhinweise',
        DELIVERY_FEE_LABEL: 'Liefergebühr',
        PREMIUM_OPTIONS_LABEL: 'Premium-Optionen',
        THANK_YOU_MESSAGE: `Vielen Dank, dass Sie sich für ${brand.displayName} entschieden haben!`,
        CLOSING_MESSAGE: `Mit freundlichen Grüßen,<br>Das ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_AUTOMATED_MESSAGE: 'Dies ist eine automatisierte Nachricht. Bitte antworten Sie nicht auf diese E-Mail.',
        STATUS_MESSAGES: {
          pending: 'Ihre Bestellung wurde erstellt',
          in_progress: 'Ihre Wäsche wurde empfangen und wird bearbeitet',
          out_for_delivery: 'Ihre Wäsche ist auf dem Rückweg zu Ihnen',
          complete: 'Ihre Wäsche wurde geliefert'
        },
        STATUS_TITLES: {
          pending: 'Bestellung erstellt',
          in_progress: 'Wäsche in Bearbeitung',
          out_for_delivery: 'Unterwegs',
          complete: 'Bestellung abgeschlossen'
        }
      }
    };

    const emailTranslations = translations[language] || translations.en;
    const statusMessages = emailTranslations.STATUS_MESSAGES;
    const statusTitles = emailTranslations.STATUS_TITLES;

    const data = {
      first_name: customer.firstName,
      order_id: order.orderId,
      status_message: statusMessages[status] || '',
      weight_info: '',
      total_info: '',
      extra_block: buildOrderExtraBlock(status, opts, emailTranslations, language),
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjectPrefix = {
      en: 'Order Update',
      es: 'Actualización del Pedido',
      pt: 'Atualização do Pedido',
      de: 'Bestellaktualisierung'
    };
    const subject = `${subjectPrefix[language] || subjectPrefix.en}: ${statusTitles[status] || status.charAt(0).toUpperCase() + status.slice(1)}`;

    await sendEmail(
      customer.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending order status update email:', error);
  }
};

/**
 * Send order cancellation email to customer
 */
exports.sendOrderCancellationEmail = async (customer, order) => {
  try {
    const language = customer.languagePreference || 'en';
    const template = await loadTemplate('customer-order-cancelled', language);

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: 'Your Order Has Been Cancelled',
        EMAIL_HEADER: 'Order Cancelled',
        GREETING: `Hello ${customer.firstName},`,
        CANCELLATION_MESSAGE: 'Your laundry pickup order has been cancelled.',
        CANCELLATION_DETAILS_TITLE: 'Cancellation Details',
        ORDER_ID_LABEL: 'Order ID',
        CANCELLED_AT_LABEL: 'Cancelled At',
        APOLOGY_MESSAGE: 'We\'re sorry for any inconvenience. If you have any questions, please contact your affiliate partner.',
        CLOSING_MESSAGE: `Best regards,<br>The ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_AUTOMATED_MESSAGE: 'This is an automated message. Please do not reply to this email.'
      },
      es: {
        EMAIL_TITLE: 'Su Pedido Ha Sido Cancelado',
        EMAIL_HEADER: 'Pedido Cancelado',
        GREETING: `Hola ${customer.firstName},`,
        CANCELLATION_MESSAGE: 'Su pedido de recogida de lavandería ha sido cancelado.',
        CANCELLATION_DETAILS_TITLE: 'Detalles de Cancelación',
        ORDER_ID_LABEL: 'ID del Pedido',
        CANCELLED_AT_LABEL: 'Cancelado a las',
        APOLOGY_MESSAGE: 'Lamentamos cualquier inconveniente. Si tiene preguntas, contacte a su socio afiliado.',
        CLOSING_MESSAGE: `Saludos cordiales,<br>El Equipo de ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este es un mensaje automatizado. Por favor no responda a este correo.'
      },
      pt: {
        EMAIL_TITLE: 'Seu Pedido Foi Cancelado',
        EMAIL_HEADER: 'Pedido Cancelado',
        GREETING: `Olá ${customer.firstName},`,
        CANCELLATION_MESSAGE: 'Seu pedido de coleta de lavanderia foi cancelado.',
        CANCELLATION_DETAILS_TITLE: 'Detalhes do Cancelamento',
        ORDER_ID_LABEL: 'ID do Pedido',
        CANCELLED_AT_LABEL: 'Cancelado às',
        APOLOGY_MESSAGE: 'Pedimos desculpas por qualquer inconveniente. Se tiver dúvidas, entre em contato com seu parceiro afiliado.',
        CLOSING_MESSAGE: `Atenciosamente,<br>A Equipe ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Esta é uma mensagem automatizada. Por favor, não responda a este e-mail.'
      },
      de: {
        EMAIL_TITLE: 'Ihre Bestellung wurde storniert',
        EMAIL_HEADER: 'Bestellung storniert',
        GREETING: `Hallo ${customer.firstName},`,
        CANCELLATION_MESSAGE: 'Ihre Wäscheabholung wurde storniert.',
        CANCELLATION_DETAILS_TITLE: 'Stornierungsdetails',
        ORDER_ID_LABEL: 'Bestell-ID',
        CANCELLED_AT_LABEL: 'Storniert um',
        APOLOGY_MESSAGE: 'Wir entschuldigen uns für etwaige Unannehmlichkeiten. Bei Fragen kontaktieren Sie bitte Ihren Affiliate-Partner.',
        CLOSING_MESSAGE: `Mit freundlichen Grüßen,<br>Das ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_AUTOMATED_MESSAGE: 'Dies ist eine automatisierte Nachricht. Bitte antworten Sie nicht auf diese E-Mail.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      first_name: customer.firstName,
      order_id: order.orderId,
      cancellation_time: new Date().toLocaleTimeString(),
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: 'Your Order Has Been Cancelled',
      es: 'Su Pedido Ha Sido Cancelado',
      pt: 'Seu Pedido Foi Cancelado',
      de: 'Ihre Bestellung wurde storniert'
    };
    const subject = subjects[language] || subjects.en;

    await sendEmail(
      customer.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending order cancellation email:', error);
  }
};

/**
 * Notification B (spec §6.6) — customer "your laundry was delivered".
 * Sent at order `delivered`: affiliate door confirm, customer PIN
 * confirm, or the re-intake auto-deliver (method 'reintake').
 * Best-effort: returns false on failure, never throws.
 */
exports.sendCustomerDeliveredEmail = async (customer, order, { affiliateName } = {}) => {
  try {
    const language = customer.languagePreference || 'en';
    const template = await loadTemplate('customer-order-delivered', language);

    const translations = {
      en: {
        EMAIL_TITLE: 'Your Laundry Was Delivered',
        EMAIL_HEADER: 'Laundry Delivered!',
        GREETING: `Hello ${customer.firstName},`,
        DELIVERED_MESSAGE: 'Your clean laundry has been delivered. The bag is back with you and ready for next time.',
        ORDER_ID_LABEL: 'Order ID',
        DELIVERED_AT_LABEL: 'Delivered',
        DELIVERED_BY_LABEL: 'Delivered by',
        AFFILIATE_NAME_FALLBACK: 'Your delivery provider',
        THANKS_MESSAGE: `Thank you for choosing ${brand.displayName}!`,
        CLOSING_MESSAGE: `Best regards,<br>The ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_AUTOMATED_MESSAGE: 'This is an automated message. Please do not reply to this email.'
      },
      es: {
        EMAIL_TITLE: 'Su ropa fue entregada',
        EMAIL_HEADER: '¡Ropa entregada!',
        GREETING: `Hola ${customer.firstName},`,
        DELIVERED_MESSAGE: 'Su ropa limpia ha sido entregada. La bolsa está de vuelta con usted y lista para la próxima vez.',
        ORDER_ID_LABEL: 'ID del Pedido',
        DELIVERED_AT_LABEL: 'Entregado',
        DELIVERED_BY_LABEL: 'Entregado por',
        AFFILIATE_NAME_FALLBACK: 'Su proveedor de entrega',
        THANKS_MESSAGE: `¡Gracias por elegir ${brand.displayName}!`,
        CLOSING_MESSAGE: `Saludos cordiales,<br>El Equipo de ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este es un mensaje automatizado. Por favor no responda a este correo.'
      },
      pt: {
        EMAIL_TITLE: 'Sua roupa foi entregue',
        EMAIL_HEADER: 'Roupa entregue!',
        GREETING: `Olá ${customer.firstName},`,
        DELIVERED_MESSAGE: 'Sua roupa limpa foi entregue. A sacola está de volta com você e pronta para a próxima vez.',
        ORDER_ID_LABEL: 'ID do Pedido',
        DELIVERED_AT_LABEL: 'Entregue',
        DELIVERED_BY_LABEL: 'Entregue por',
        AFFILIATE_NAME_FALLBACK: 'Seu provedor de entrega',
        THANKS_MESSAGE: `Obrigado por escolher a ${brand.displayName}!`,
        CLOSING_MESSAGE: `Atenciosamente,<br>Equipe ${brand.displayName}`,
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Esta é uma mensagem automática. Por favor, não responda a este e-mail.'
      },
      de: {
        EMAIL_TITLE: 'Ihre Wäsche wurde geliefert',
        EMAIL_HEADER: 'Wäsche geliefert!',
        GREETING: `Hallo ${customer.firstName},`,
        DELIVERED_MESSAGE: 'Ihre saubere Wäsche wurde geliefert. Der Beutel ist wieder bei Ihnen und bereit für das nächste Mal.',
        ORDER_ID_LABEL: 'Auftragsnummer',
        DELIVERED_AT_LABEL: 'Geliefert',
        DELIVERED_BY_LABEL: 'Geliefert von',
        AFFILIATE_NAME_FALLBACK: 'Ihr Lieferpartner',
        THANKS_MESSAGE: `Vielen Dank, dass Sie ${brand.displayName} gewählt haben!`,
        CLOSING_MESSAGE: `Mit freundlichen Grüßen,<br>Ihr ${brand.displayName} Team`,
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_AUTOMATED_MESSAGE: 'Dies ist eine automatische Nachricht. Bitte antworten Sie nicht auf diese E-Mail.'
      }
    };
    const t = translations[language] || translations.en;

    const deliveredAt = order.completedAt
      ? new Date(order.completedAt)
      : (order.delivery && order.delivery.at ? new Date(order.delivery.at) : new Date());
    const html = fillTemplate(template, {
      ...t,
      ORDER_ID: order.orderId,
      DELIVERED_AT: deliveredAt.toLocaleString(),
      AFFILIATE_NAME: affiliateName || t.AFFILIATE_NAME_FALLBACK,
      CURRENT_YEAR: String(new Date().getFullYear())
    });

    await sendEmail(customer.email, t.EMAIL_TITLE, html);
    logger.info(`Customer delivered email sent to ${customer.email} for order ${order.orderId}`);
    return true;
  } catch (error) {
    logger.error('Error sending customer delivered email:', error);
    return false;
  }
};

/**
 * Send a fresh "confirm your email" link after a customer changes their email
 * in "Edit my info". Until they click it, order emails stay suppressed.
 * @param {{email,firstName,languagePreference}} customer
 * @param {{emailVerifyToken:string}} opts
 */
exports.sendCustomerEmailConfirmation = async (customer, { emailVerifyToken } = {}) => {
  try {
    if (!customer || !customer.email || !emailVerifyToken) {
      logger.error('sendCustomerEmailConfirmation: missing email or token');
      return false;
    }
    const language = customer.languagePreference || 'en';
    const template = await loadTemplate('customer-confirm-email', language);
    const baseUrl = process.env.BASE_URL || 'https://rundberglaundry.com';
    const verifyUrl = `${baseUrl}/api/v1/customers/verify-email/${encodeURIComponent(emailVerifyToken)}`;

    const T = {
      en: { EMAIL_TITLE: 'Confirm your email', EMAIL_HEADER: 'Confirm your new email', GREETING: `Hi ${customer.firstName || ''},`, CONFIRM_EMAIL_MESSAGE: 'You updated your email. Confirm it so we can send you order updates — until you confirm, we won\'t email you.', CONFIRM_EMAIL_BUTTON: 'Confirm your email', FOOTER_SUPPORT: 'If you didn\'t change your email, please contact your service provider.', FOOTER_RIGHTS: 'All rights reserved.' },
      es: { EMAIL_TITLE: 'Confirme su correo', EMAIL_HEADER: 'Confirme su nuevo correo', GREETING: `Hola ${customer.firstName || ''},`, CONFIRM_EMAIL_MESSAGE: 'Actualizó su correo. Confírmelo para que podamos enviarle actualizaciones de su pedido. Hasta que confirme, no le enviaremos correos.', CONFIRM_EMAIL_BUTTON: 'Confirmar correo', FOOTER_SUPPORT: 'Si no cambió su correo, contacte a su proveedor de servicio.', FOOTER_RIGHTS: 'Todos los derechos reservados.' },
      pt: { EMAIL_TITLE: 'Confirme seu e-mail', EMAIL_HEADER: 'Confirme seu novo e-mail', GREETING: `Olá ${customer.firstName || ''},`, CONFIRM_EMAIL_MESSAGE: 'Você atualizou seu e-mail. Confirme-o para que possamos enviar atualizações do pedido. Até confirmar, não enviaremos e-mails.', CONFIRM_EMAIL_BUTTON: 'Confirmar e-mail', FOOTER_SUPPORT: 'Se você não alterou seu e-mail, contate seu provedor de serviço.', FOOTER_RIGHTS: 'Todos os direitos reservados.' },
      de: { EMAIL_TITLE: 'Bestätigen Sie Ihre E-Mail', EMAIL_HEADER: 'Bestätigen Sie Ihre neue E-Mail', GREETING: `Hallo ${customer.firstName || ''},`, CONFIRM_EMAIL_MESSAGE: 'Sie haben Ihre E-Mail aktualisiert. Bestätigen Sie sie, damit wir Ihnen Bestellaktualisierungen senden können. Bis zur Bestätigung senden wir keine E-Mails.', CONFIRM_EMAIL_BUTTON: 'E-Mail bestätigen', FOOTER_SUPPORT: 'Wenn Sie Ihre E-Mail nicht geändert haben, kontaktieren Sie Ihren Dienstleister.', FOOTER_RIGHTS: 'Alle Rechte vorbehalten.' }
    };
    const t = T[language] || T.en;
    const html = fillTemplate(template, { ...t, VERIFY_URL: verifyUrl, CURRENT_YEAR: String(new Date().getFullYear()) });
    await sendEmail(customer.email, t.EMAIL_TITLE, html);
    logger.info('Customer email-confirmation sent', { customerId: customer.customerId });
    return true;
  } catch (error) {
    logger.error('Error sending customer email confirmation:', error);
    return false;
  }
};

module.exports = exports;
