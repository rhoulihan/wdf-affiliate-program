// Administrator account service
//
// CRUD + password flows for the Administrator model. A handful of safety
// nets live here that don't belong in a thin controller:
//
//   - Last-super-admin check on permissions changes and deletes prevents
//     an admin from locking everyone out of the dashboard.
//   - Self-deactivation / self-deletion guards.
//   - Password history check on changeAdministratorPassword (blocks the
//     last 5 passwords from being reused) — delegates to the model's
//     setPassword which also rehashes and appends to the history.

const Administrator = require('../models/Administrator');
const { fieldFilter } = require('../utils/fieldFilter');
const encryptionUtil = require('../utils/encryption');
const { validatePasswordStrength } = require('../utils/passwordValidator');
const { logAuditEvent, AuditEvents } = require('../utils/auditLogger');

class AdministratorAccountError extends Error {
  constructor(code, message, status = 400, extras = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extras = extras;
    this.isAdministratorAccountError = true;
  }
}

const AVAILABLE_PERMISSIONS = [
  'all',
  'administrators.read',
  'administrators.create',
  'administrators.update',
  'administrators.delete',
  'operators.manage',
  'operators.read',
  'customers.manage',
  'customers.read',
  'affiliates.manage',
  'affiliates.read',
  'orders.manage',
  'orders.read',
  'reports.view',
  'system.configure',
  'operator_management',
  'view_analytics',
  'system_config'
];

async function listAdministrators({
  page = 1, limit = 20, active, search,
  sortBy = 'createdAt', sortOrder = 'desc'
}) {
  const query = {};
  if (active !== undefined) query.isActive = active === 'true';
  if (search) {
    query.$or = [
      { firstName: new RegExp(search, 'i') },
      { lastName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { adminId: new RegExp(search, 'i') }
    ];
  }

  const administrators = await Administrator.find(query)
    .select('-password')
    .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Administrator.countDocuments(query);

  return {
    administrators: administrators.map(admin => fieldFilter(admin.toObject(), 'administrator')),
    pagination: {
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit, 10)
    }
  };
}

async function getAdministratorById({ id }) {
  const administrator = await Administrator.findById(id).select('-password');
  if (!administrator) {
    throw new AdministratorAccountError('not_found', 'Administrator not found', 404);
  }
  return fieldFilter(administrator.toObject(), 'administrator');
}

async function createAdministrator({ payload, adminId, req }) {
  const { firstName, lastName, email, password, permissions = [] } = payload;

  const existing = await Administrator.findOne({ email: email.toLowerCase() });
  if (existing) throw new AdministratorAccountError('duplicate_email', 'Email already exists', 409);

  const count = await Administrator.countDocuments();
  const newAdminId = `ADM${String(count + 1).padStart(3, '0')}`;

  const { salt, hash } = encryptionUtil.hashPassword(password);

  const administrator = new Administrator({
    adminId: newAdminId,
    firstName,
    lastName,
    email: email.toLowerCase(),
    passwordSalt: salt,
    passwordHash: hash,
    permissions,
    createdAt: new Date()
  });

  await administrator.save();

  logAuditEvent(AuditEvents.ACCOUNT_CREATED, {
    action: 'CREATE_ADMINISTRATOR',
    userId: adminId,
    userType: 'administrator',
    targetId: administrator._id,
    targetType: 'administrator',
    details: { adminId: administrator.adminId, email: administrator.email }
  }, req);

  return fieldFilter(administrator.toObject(), 'administrator');
}

async function updateAdministrator({ id, updates, adminId, req }) {
  delete updates.adminId;
  delete updates.role;
  delete updates.createdAt;

  if (updates.isActive === false && id === adminId) {
    throw new AdministratorAccountError('self_deactivate', 'Cannot deactivate your own account');
  }

  // Last-super-admin check when the admin downgrades their own permissions.
  if (updates.permissions && id === adminId) {
    const current = await Administrator.findById(id);
    if (current && current.permissions.includes('all') && !updates.permissions.includes('all')) {
      const superAdminCount = await Administrator.countDocuments({
        permissions: 'all',
        isActive: true
      });
      if (superAdminCount <= 1) {
        throw new AdministratorAccountError(
          'last_super_admin',
          'Cannot remove super admin permissions from the last active super administrator'
        );
      }
    }
  }

  if (updates.email) {
    const emailExists = await Administrator.findOne({
      email: updates.email.toLowerCase(),
      _id: { $ne: id }
    });
    if (emailExists) throw new AdministratorAccountError('duplicate_email', 'Email already exists', 409);
    updates.email = updates.email.toLowerCase();
  }

  if (updates.password) {
    const { salt, hash } = encryptionUtil.hashPassword(updates.password);
    updates.passwordSalt = salt;
    updates.passwordHash = hash;
    delete updates.password;
  }

  const administrator = await Administrator.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  ).select('-password');

  if (!administrator) {
    throw new AdministratorAccountError('not_found', 'Administrator not found', 404);
  }

  logAuditEvent(AuditEvents.ACCOUNT_UPDATED, {
    action: 'UPDATE_ADMINISTRATOR',
    userId: adminId,
    userType: 'administrator',
    targetId: administrator._id,
    targetType: 'administrator',
    details: { updates }
  }, req);

  return fieldFilter(administrator.toObject(), 'administrator');
}

async function deleteAdministrator({ id, adminId, req }) {
  if (id === adminId) {
    throw new AdministratorAccountError('self_delete', 'Cannot delete your own account');
  }

  // Last-super-admin guard on delete: block removing the only remaining 'all'.
  const otherSupers = await Administrator.find({
    permissions: 'all',
    _id: { $ne: id }
  });
  if (otherSupers.length === 0) {
    const target = await Administrator.findById(id);
    if (target && target.permissions.includes('all')) {
      throw new AdministratorAccountError(
        'last_super_admin',
        'Cannot delete the last administrator with full permissions'
      );
    }
  }

  const administrator = await Administrator.findByIdAndDelete(id);
  if (!administrator) {
    throw new AdministratorAccountError('not_found', 'Administrator not found', 404);
  }

  logAuditEvent(AuditEvents.ACCOUNT_DELETED, {
    action: 'DELETE_ADMINISTRATOR',
    userId: adminId,
    userType: 'administrator',
    targetId: id,
    targetType: 'administrator',
    details: { adminId: administrator.adminId, email: administrator.email }
  }, req);
}

async function resetAdministratorPassword({ id, newPassword, adminId, req }) {
  const passwordValidation = validatePasswordStrength(newPassword, '', '');
  if (!passwordValidation.success) {
    throw new AdministratorAccountError(
      'weak_password',
      'Password does not meet security requirements',
      400,
      { errors: passwordValidation.errors }
    );
  }

  const administrator = await Administrator.findById(id);
  if (!administrator) {
    throw new AdministratorAccountError('not_found', 'Administrator not found', 404);
  }

  const { salt, hash } = encryptionUtil.hashPassword(newPassword);
  administrator.passwordSalt = salt;
  administrator.passwordHash = hash;
  administrator.loginAttempts = 0;
  administrator.lockUntil = undefined;
  await administrator.save();

  logAuditEvent(AuditEvents.PASSWORD_RESET_SUCCESS, {
    action: 'RESET_ADMINISTRATOR_PASSWORD',
    userId: adminId,
    userType: 'administrator',
    targetId: administrator._id,
    targetType: 'administrator',
    details: { adminId: administrator.adminId }
  }, req);
}

async function changeAdministratorPassword({ administratorId, currentPassword, newPassword, req }) {
  if (!currentPassword || !newPassword) {
    throw new AdministratorAccountError(
      'missing_fields',
      'Current password and new password are required'
    );
  }

  const administrator = await Administrator.findById(administratorId).select('+password');
  if (!administrator) {
    throw new AdministratorAccountError('not_found', 'Administrator not found', 404);
  }

  if (!administrator.verifyPassword(currentPassword)) {
    logAuditEvent(AuditEvents.PASSWORD_CHANGE_FAILED, {
      action: 'CHANGE_PASSWORD_FAILED',
      userId: administratorId,
      userType: 'administrator',
      reason: 'Invalid current password'
    }, req);
    throw new AdministratorAccountError('invalid_current', 'Current password is incorrect', 401);
  }

  if (administrator.isPasswordInHistory && administrator.isPasswordInHistory(newPassword)) {
    throw new AdministratorAccountError(
      'password_reused',
      'New password cannot be the same as any of your last 5 passwords'
    );
  }

  const validation = validatePasswordStrength(newPassword, {
    username: administrator.email.split('@')[0],
    email: administrator.email
  });
  if (!validation.success) {
    throw new AdministratorAccountError(
      'weak_password',
      'Password does not meet security requirements',
      400,
      { errors: validation.errors }
    );
  }

  administrator.setPassword(newPassword);
  administrator.requirePasswordChange = false;
  await administrator.save();

  logAuditEvent(AuditEvents.PASSWORD_CHANGE_SUCCESS, {
    action: 'CHANGE_PASSWORD_SUCCESS',
    userId: administratorId,
    userType: 'administrator',
    details: { adminId: administrator.adminId }
  }, req);
}

function getPermissions() {
  return AVAILABLE_PERMISSIONS;
}

module.exports = {
  listAdministrators,
  getAdministratorById,
  createAdministrator,
  updateAdministrator,
  deleteAdministrator,
  resetAdministratorPassword,
  changeAdministratorPassword,
  getPermissions,
  AdministratorAccountError,
  AVAILABLE_PERMISSIONS
};
