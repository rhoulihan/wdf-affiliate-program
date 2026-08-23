const logger = require('../../../utils/logger');
// Operator email dispatchers.
// Extracted from utils/emailService.js in Phase 2.

const { loadTemplate, fillTemplate } = require('../template-manager');
const { sendEmail } = require('../transport');
const brand = require('../../../config/brand');
// =============================================================================
// Operator Emails
// =============================================================================

/**
 * Send welcome email to a new operator
 */
exports.sendOperatorWelcomeEmail = async (operator, temporaryPin) => {
  try {
    const language = operator.languagePreference || 'en';
    const template = await loadTemplate('operator-welcome', language);

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: `Welcome to ${brand.displayName} Operations Team`,
        EMAIL_HEADER: `Welcome to ${brand.displayName} Operations`,
        EMAIL_SUBHEADER: 'Your Operator Account is Ready',
        GREETING: `Welcome aboard, ${operator.firstName}!`,
        WELCOME_MESSAGE: `We\'re excited to have you join the ${brand.displayName} operations team. Your operator account has been created and you\'re ready to start processing orders.`,
        CREDENTIALS_TITLE: 'Your Login Credentials',
        EMPLOYEE_ID_LABEL: 'Employee ID',
        TEMPORARY_PIN_LABEL: 'Temporary PIN',
        EMAIL_LABEL: 'Email',
        SHIFT_HOURS_LABEL: 'Shift Hours',
        LOGIN_BUTTON: 'Login to Operator Portal',
        IMPORTANT_INFO_TITLE: 'Important Information',
        IMPORTANT_INFO_LIST: '<ul><li>Change your PIN on first login</li><li>You can only login during your assigned shift hours</li><li>Keep your PIN confidential - never share it with anyone</li><li>Clock in at the start of your shift and clock out when finished</li><li>Contact your supervisor if you have any questions</li></ul>',
        SUPPORT_MESSAGE: 'If you need assistance or have questions about your account, please contact your supervisor or the administrator.',
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_SECURITY_NOTE: 'This email contains confidential login information. Please keep it secure.'
      },
      es: {
        EMAIL_TITLE: `Bienvenido al Equipo de Operaciones ${brand.displayName}`,
        EMAIL_HEADER: `Bienvenido a Operaciones ${brand.displayName}`,
        EMAIL_SUBHEADER: 'Su Cuenta de Operador está Lista',
        GREETING: `¡Bienvenido a bordo, ${operator.firstName}!`,
        WELCOME_MESSAGE: `Estamos emocionados de que se una al equipo de operaciones ${brand.displayName}. Su cuenta de operador ha sido creada y está listo para comenzar a procesar pedidos.`,
        CREDENTIALS_TITLE: 'Sus Credenciales de Acceso',
        EMPLOYEE_ID_LABEL: 'ID de Empleado',
        TEMPORARY_PIN_LABEL: 'PIN Temporal',
        EMAIL_LABEL: 'Correo Electrónico',
        SHIFT_HOURS_LABEL: 'Horario de Turno',
        LOGIN_BUTTON: 'Ingresar al Portal de Operador',
        IMPORTANT_INFO_TITLE: 'Información Importante',
        IMPORTANT_INFO_LIST: '<ul><li>Cambie su PIN en el primer inicio de sesión</li><li>Solo puede iniciar sesión durante sus horas de turno asignadas</li><li>Mantenga su PIN confidencial - nunca lo comparta con nadie</li><li>Registre su entrada al inicio de su turno y su salida al finalizar</li><li>Contacte a su supervisor si tiene alguna pregunta</li></ul>',
        SUPPORT_MESSAGE: 'Si necesita asistencia o tiene preguntas sobre su cuenta, contacte a su supervisor o al administrador.',
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_SECURITY_NOTE: 'Este correo contiene información de acceso confidencial. Por favor manténgala segura.'
      },
      pt: {
        EMAIL_TITLE: `Bem-vindo à Equipe de Operações ${brand.displayName}`,
        EMAIL_HEADER: `Bem-vindo às Operações ${brand.displayName}`,
        EMAIL_SUBHEADER: 'Sua Conta de Operador está Pronta',
        GREETING: `Bem-vindo a bordo, ${operator.firstName}!`,
        WELCOME_MESSAGE: `Estamos animados em tê-lo na equipe de operações ${brand.displayName}. Sua conta de operador foi criada e você está pronto para começar a processar pedidos.`,
        CREDENTIALS_TITLE: 'Suas Credenciais de Login',
        EMPLOYEE_ID_LABEL: 'ID do Funcionário',
        TEMPORARY_PIN_LABEL: 'PIN Temporário',
        EMAIL_LABEL: 'E-mail',
        SHIFT_HOURS_LABEL: 'Horário do Turno',
        LOGIN_BUTTON: 'Entrar no Portal do Operador',
        IMPORTANT_INFO_TITLE: 'Informações Importantes',
        IMPORTANT_INFO_LIST: '<ul><li>Mude seu PIN no primeiro login</li><li>Você só pode fazer login durante seus horários de turno atribuídos</li><li>Mantenha seu PIN confidencial - nunca o compartilhe com ninguém</li><li>Registre entrada no início do seu turno e saída quando terminar</li><li>Entre em contato com seu supervisor se tiver alguma dúvida</li></ul>',
        SUPPORT_MESSAGE: 'Se precisar de assistência ou tiver dúvidas sobre sua conta, entre em contato com seu supervisor ou o administrador.',
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_SECURITY_NOTE: 'Este e-mail contém informações de login confidenciais. Por favor, mantenha-o seguro.'
      },
      de: {
        EMAIL_TITLE: `Willkommen beim ${brand.displayName} Operations Team`,
        EMAIL_HEADER: `Willkommen bei ${brand.displayName} Operations`,
        EMAIL_SUBHEADER: 'Ihr Betreiberkonto ist bereit',
        GREETING: `Willkommen an Bord, ${operator.firstName}!`,
        WELCOME_MESSAGE: `Wir freuen uns, Sie im ${brand.displayName} Operations Team begrüßen zu dürfen. Ihr Betreiberkonto wurde erstellt und Sie können mit der Bearbeitung von Aufträgen beginnen.`,
        CREDENTIALS_TITLE: 'Ihre Anmeldedaten',
        EMPLOYEE_ID_LABEL: 'Mitarbeiter-ID',
        TEMPORARY_PIN_LABEL: 'Temporäre PIN',
        EMAIL_LABEL: 'E-Mail',
        SHIFT_HOURS_LABEL: 'Schichtzeiten',
        LOGIN_BUTTON: 'Zum Betreiberportal anmelden',
        IMPORTANT_INFO_TITLE: 'Wichtige Informationen',
        IMPORTANT_INFO_LIST: '<ul><li>Ändern Sie Ihre PIN bei der ersten Anmeldung</li><li>Sie können sich nur während Ihrer zugewiesenen Schichtzeiten anmelden</li><li>Halten Sie Ihre PIN vertraulich - teilen Sie sie niemals mit anderen</li><li>Stempeln Sie zu Beginn Ihrer Schicht ein und am Ende aus</li><li>Kontaktieren Sie Ihren Vorgesetzten bei Fragen</li></ul>',
        SUPPORT_MESSAGE: 'Wenn Sie Hilfe benötigen oder Fragen zu Ihrem Konto haben, wenden Sie sich bitte an Ihren Vorgesetzten oder den Administrator.',
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_SECURITY_NOTE: 'Diese E-Mail enthält vertrauliche Anmeldeinformationen. Bitte bewahren Sie sie sicher auf.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      first_name: operator.firstName,
      last_name: operator.lastName,
      employee_id: operator.operatorId || operator.employeeId,
      email: operator.email,
      temporary_pin: temporaryPin,
      shift_hours: operator.shiftStart && operator.shiftEnd ? `${operator.shiftStart} - ${operator.shiftEnd}` : 'Not specified',
      login_url: `${process.env.BASE_URL || 'https://rundberglaundry.com'}/embed-app-v2.html?login=operator`,
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: `Welcome to ${brand.displayName} Operations Team`,
      es: `Bienvenido al Equipo de Operaciones ${brand.displayName}`,
      pt: `Bem-vindo à Equipe de Operações ${brand.displayName}`,
      de: `Willkommen beim ${brand.displayName} Operations Team`
    };
    const subject = subjects[language] || subjects.en;

    await sendEmail(
      operator.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending operator welcome email:', error);
  }
};

/**
 * Send PIN reset email to operator
 */
exports.sendOperatorPinResetEmail = async (operator, newPin) => {
  try {
    const language = operator.languagePreference || 'en';
    const template = await loadTemplate('operator-pin-reset', language);

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: 'Your PIN Has Been Reset',
        EMAIL_HEADER: 'PIN Reset Notification',
        GREETING: `Hello ${operator.firstName},`,
        RESET_MESSAGE: 'Your PIN has been reset by an administrator. Please use the new PIN below to access your account.',
        SECURITY_ALERT_LABEL: 'Security Alert',
        SECURITY_ALERT_MESSAGE: 'If you did not request this PIN reset, please contact your supervisor immediately.',
        NEW_PIN_LABEL: 'Your New PIN',
        EMPLOYEE_ID_LABEL: 'Employee ID',
        RESET_TIME_LABEL: 'Reset Time',
        RESET_TIME: 'Just now',
        NEXT_STEPS_TITLE: 'Next Steps',
        NEXT_STEPS_LIST: '<ol><li>Login using your Employee ID and the new PIN above</li><li>You will be prompted to change your PIN on first login</li><li>Choose a PIN that is easy for you to remember but hard for others to guess</li><li>Never share your PIN with anyone</li></ol>',
        LOGIN_BUTTON: 'Login to Operator Portal',
        SUPPORT_MESSAGE: 'If you have any issues logging in or questions about this reset, please contact your supervisor.',
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_SECURITY_NOTE: 'This email contains confidential login information. Please delete after use.'
      },
      es: {
        EMAIL_TITLE: 'Su PIN Ha Sido Restablecido',
        EMAIL_HEADER: 'Notificación de Restablecimiento de PIN',
        GREETING: `Hola ${operator.firstName},`,
        RESET_MESSAGE: 'Su PIN ha sido restablecido por un administrador. Por favor use el nuevo PIN a continuación para acceder a su cuenta.',
        SECURITY_ALERT_LABEL: 'Alerta de Seguridad',
        SECURITY_ALERT_MESSAGE: 'Si no solicitó este restablecimiento de PIN, contacte a su supervisor inmediatamente.',
        NEW_PIN_LABEL: 'Su Nuevo PIN',
        EMPLOYEE_ID_LABEL: 'ID de Empleado',
        RESET_TIME_LABEL: 'Hora de Restablecimiento',
        RESET_TIME: 'Ahora mismo',
        NEXT_STEPS_TITLE: 'Próximos Pasos',
        NEXT_STEPS_LIST: '<ol><li>Inicie sesión usando su ID de Empleado y el nuevo PIN anterior</li><li>Se le pedirá que cambie su PIN en el primer inicio de sesión</li><li>Elija un PIN que sea fácil de recordar pero difícil de adivinar para otros</li><li>Nunca comparta su PIN con nadie</li></ol>',
        LOGIN_BUTTON: 'Ingresar al Portal de Operador',
        SUPPORT_MESSAGE: 'Si tiene problemas para iniciar sesión o preguntas sobre este restablecimiento, contacte a su supervisor.',
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_SECURITY_NOTE: 'Este correo contiene información de acceso confidencial. Por favor elimínelo después de usarlo.'
      },
      pt: {
        EMAIL_TITLE: 'Seu PIN Foi Redefinido',
        EMAIL_HEADER: 'Notificação de Redefinição de PIN',
        GREETING: `Olá ${operator.firstName},`,
        RESET_MESSAGE: 'Seu PIN foi redefinido por um administrador. Por favor, use o novo PIN abaixo para acessar sua conta.',
        SECURITY_ALERT_LABEL: 'Alerta de Segurança',
        SECURITY_ALERT_MESSAGE: 'Se você não solicitou esta redefinição de PIN, entre em contato com seu supervisor imediatamente.',
        NEW_PIN_LABEL: 'Seu Novo PIN',
        EMPLOYEE_ID_LABEL: 'ID do Funcionário',
        RESET_TIME_LABEL: 'Hora da Redefinição',
        RESET_TIME: 'Agora mesmo',
        NEXT_STEPS_TITLE: 'Próximos Passos',
        NEXT_STEPS_LIST: '<ol><li>Faça login usando seu ID de Funcionário e o novo PIN acima</li><li>Você será solicitado a alterar seu PIN no primeiro login</li><li>Escolha um PIN que seja fácil de lembrar mas difícil para outros adivinharem</li><li>Nunca compartilhe seu PIN com ninguém</li></ol>',
        LOGIN_BUTTON: 'Entrar no Portal do Operador',
        SUPPORT_MESSAGE: 'Se tiver problemas para fazer login ou dúvidas sobre esta redefinição, entre em contato com seu supervisor.',
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_SECURITY_NOTE: 'Este e-mail contém informações de login confidenciais. Por favor, exclua após o uso.'
      },
      de: {
        EMAIL_TITLE: 'Ihre PIN wurde zurückgesetzt',
        EMAIL_HEADER: 'PIN-Zurücksetzung Benachrichtigung',
        GREETING: `Hallo ${operator.firstName},`,
        RESET_MESSAGE: 'Ihre PIN wurde von einem Administrator zurückgesetzt. Bitte verwenden Sie die unten stehende neue PIN, um auf Ihr Konto zuzugreifen.',
        SECURITY_ALERT_LABEL: 'Sicherheitswarnung',
        SECURITY_ALERT_MESSAGE: 'Wenn Sie diese PIN-Zurücksetzung nicht angefordert haben, kontaktieren Sie bitte sofort Ihren Vorgesetzten.',
        NEW_PIN_LABEL: 'Ihre neue PIN',
        EMPLOYEE_ID_LABEL: 'Mitarbeiter-ID',
        RESET_TIME_LABEL: 'Zurücksetzungszeit',
        RESET_TIME: 'Gerade eben',
        NEXT_STEPS_TITLE: 'Nächste Schritte',
        NEXT_STEPS_LIST: '<ol><li>Melden Sie sich mit Ihrer Mitarbeiter-ID und der neuen PIN oben an</li><li>Sie werden beim ersten Login aufgefordert, Ihre PIN zu ändern</li><li>Wählen Sie eine PIN, die für Sie leicht zu merken, aber für andere schwer zu erraten ist</li><li>Teilen Sie Ihre PIN niemals mit anderen</li></ol>',
        LOGIN_BUTTON: 'Zum Betreiberportal anmelden',
        SUPPORT_MESSAGE: 'Wenn Sie Probleme beim Anmelden haben oder Fragen zu dieser Zurücksetzung haben, kontaktieren Sie bitte Ihren Vorgesetzten.',
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_SECURITY_NOTE: 'Diese E-Mail enthält vertrauliche Anmeldeinformationen. Bitte nach Gebrauch löschen.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      first_name: operator.firstName,
      employee_id: operator.employeeId,
      new_pin: newPin,
      login_url: `${process.env.BASE_URL || 'https://rundberglaundry.com'}/embed-app-v2.html?login=operator`,
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: 'Your PIN Has Been Reset',
      es: 'Su PIN Ha Sido Restablecido',
      pt: 'Seu PIN Foi Redefinido',
      de: 'Ihre PIN wurde zurückgesetzt'
    };
    const subject = subjects[language] || subjects.en;

    await sendEmail(
      operator.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending operator PIN reset email:', error);
  }
};

/**
 * Send shift reminder email to operator
 */
exports.sendOperatorShiftReminderEmail = async (operator) => {
  try {
    const language = operator.languagePreference || 'en';
    const template = await loadTemplate('operator-shift-reminder', language);

    // Get translations for the email content
    const translations = {
      en: {
        EMAIL_TITLE: 'Shift Reminder - Starting Soon',
        EMAIL_HEADER: 'Shift Reminder',
        GREETING: `Hi ${operator.firstName},`,
        REMINDER_MESSAGE: 'This is a friendly reminder that your shift is starting soon!',
        SHIFT_STARTS_LABEL: 'Your shift starts at',
        SHIFT_ENDS_LABEL: 'and ends at',
        EMPLOYEE_ID_LABEL: 'Employee ID',
        DATE_LABEL: 'Date',
        TODAY: 'Today',
        EXPECTED_DURATION_LABEL: 'Expected Duration',
        EXPECTED_DURATION: '8 hours',
        REMEMBER_TO_TITLE: 'Remember to',
        REMEMBER_TO_LIST: '<ul><li>Arrive a few minutes early to prepare</li><li>Clock in when you arrive</li><li>Check the order queue for priority items</li><li>Follow all safety protocols</li><li>Clock out at the end of your shift</li></ul>',
        LOGIN_BUTTON: 'Login to Operator Portal',
        CLOSING_MESSAGE: 'Have a great shift! If you cannot make your shift, please contact your supervisor as soon as possible.',
        FOOTER_RIGHTS: 'All rights reserved.',
        FOOTER_AUTOMATED_MESSAGE: 'This is an automated shift reminder.'
      },
      es: {
        EMAIL_TITLE: 'Recordatorio de Turno - Comienza Pronto',
        EMAIL_HEADER: 'Recordatorio de Turno',
        GREETING: `Hola ${operator.firstName},`,
        REMINDER_MESSAGE: '¡Este es un recordatorio amistoso de que su turno comienza pronto!',
        SHIFT_STARTS_LABEL: 'Su turno comienza a las',
        SHIFT_ENDS_LABEL: 'y termina a las',
        EMPLOYEE_ID_LABEL: 'ID de Empleado',
        DATE_LABEL: 'Fecha',
        TODAY: 'Hoy',
        EXPECTED_DURATION_LABEL: 'Duración Esperada',
        EXPECTED_DURATION: '8 horas',
        REMEMBER_TO_TITLE: 'Recuerde',
        REMEMBER_TO_LIST: '<ul><li>Llegue unos minutos antes para prepararse</li><li>Registre su entrada cuando llegue</li><li>Revise la cola de pedidos para artículos prioritarios</li><li>Siga todos los protocolos de seguridad</li><li>Registre su salida al final de su turno</li></ul>',
        LOGIN_BUTTON: 'Ingresar al Portal de Operador',
        CLOSING_MESSAGE: '¡Que tenga un excelente turno! Si no puede asistir a su turno, contacte a su supervisor lo antes posible.',
        FOOTER_RIGHTS: 'Todos los derechos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este es un recordatorio de turno automatizado.'
      },
      pt: {
        EMAIL_TITLE: 'Lembrete de Turno - Começando em Breve',
        EMAIL_HEADER: 'Lembrete de Turno',
        GREETING: `Oi ${operator.firstName},`,
        REMINDER_MESSAGE: 'Este é um lembrete amigável de que seu turno está começando em breve!',
        SHIFT_STARTS_LABEL: 'Seu turno começa às',
        SHIFT_ENDS_LABEL: 'e termina às',
        EMPLOYEE_ID_LABEL: 'ID do Funcionário',
        DATE_LABEL: 'Data',
        TODAY: 'Hoje',
        EXPECTED_DURATION_LABEL: 'Duração Esperada',
        EXPECTED_DURATION: '8 horas',
        REMEMBER_TO_TITLE: 'Lembre-se de',
        REMEMBER_TO_LIST: '<ul><li>Chegar alguns minutos antes para se preparar</li><li>Registrar entrada quando chegar</li><li>Verificar a fila de pedidos para itens prioritários</li><li>Seguir todos os protocolos de segurança</li><li>Registrar saída no final do turno</li></ul>',
        LOGIN_BUTTON: 'Entrar no Portal do Operador',
        CLOSING_MESSAGE: 'Tenha um ótimo turno! Se não puder comparecer ao seu turno, entre em contato com seu supervisor o mais rápido possível.',
        FOOTER_RIGHTS: 'Todos os direitos reservados.',
        FOOTER_AUTOMATED_MESSAGE: 'Este é um lembrete de turno automatizado.'
      },
      de: {
        EMAIL_TITLE: 'Schichterinnerung - Beginnt bald',
        EMAIL_HEADER: 'Schichterinnerung',
        GREETING: `Hallo ${operator.firstName},`,
        REMINDER_MESSAGE: 'Dies ist eine freundliche Erinnerung, dass Ihre Schicht bald beginnt!',
        SHIFT_STARTS_LABEL: 'Ihre Schicht beginnt um',
        SHIFT_ENDS_LABEL: 'und endet um',
        EMPLOYEE_ID_LABEL: 'Mitarbeiter-ID',
        DATE_LABEL: 'Datum',
        TODAY: 'Heute',
        EXPECTED_DURATION_LABEL: 'Erwartete Dauer',
        EXPECTED_DURATION: '8 Stunden',
        REMEMBER_TO_TITLE: 'Denken Sie daran',
        REMEMBER_TO_LIST: '<ul><li>Kommen Sie ein paar Minuten früher zur Vorbereitung</li><li>Stempeln Sie ein, wenn Sie ankommen</li><li>Überprüfen Sie die Auftragswarteschlange auf Prioritätsartikel</li><li>Befolgen Sie alle Sicherheitsprotokolle</li><li>Stempeln Sie am Ende Ihrer Schicht aus</li></ul>',
        LOGIN_BUTTON: 'Zum Betreiberportal anmelden',
        CLOSING_MESSAGE: 'Haben Sie eine großartige Schicht! Wenn Sie Ihre Schicht nicht antreten können, kontaktieren Sie bitte so schnell wie möglich Ihren Vorgesetzten.',
        FOOTER_RIGHTS: 'Alle Rechte vorbehalten.',
        FOOTER_AUTOMATED_MESSAGE: 'Dies ist eine automatisierte Schichterinnerung.'
      }
    };

    const emailTranslations = translations[language] || translations.en;

    const data = {
      first_name: operator.firstName,
      employee_id: operator.employeeId,
      shift_start: operator.shiftStart,
      shift_end: operator.shiftEnd,
      login_url: `${process.env.BASE_URL || 'https://rundberglaundry.com'}/embed-app-v2.html?login=operator`,
      current_year: new Date().getFullYear(),
      ...emailTranslations
    };

    const html = fillTemplate(template, data);

    // Translate subject based on language
    const subjects = {
      en: 'Shift Reminder - Starting Soon',
      es: 'Recordatorio de Turno - Comienza Pronto',
      pt: 'Lembrete de Turno - Começando em Breve',
      de: 'Schichterinnerung - Beginnt bald'
    };
    const subject = subjects[language] || subjects.en;

    await sendEmail(
      operator.email,
      subject,
      html
    );
  } catch (error) {
    logger.error('Error sending operator shift reminder email:', error);
  }
};

/**
 * Note: sendOperatorPasswordResetEmail is not needed since operators use PINs
 */
exports.sendOperatorPasswordResetEmail = async (operator, resetUrl) => {
  // Operators don't have passwords, they use PINs
  // This method is here for interface compatibility but should not be called
  logger.error('Operators use PINs, not passwords. Use sendOperatorPinResetEmail instead.');
};

module.exports = exports;
