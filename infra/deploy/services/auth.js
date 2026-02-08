const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Organization } = require('../models');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.saltRounds = 12;
  }

  // Hash password
  async hashPassword(password) {
    return bcrypt.hash(password, this.saltRounds);
  }

  // Verify password
  async verifyPassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }

  // Generate JWT token
  generateToken(payload) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Register new user
  async register(userData) {
    const { email, password, firstName, lastName, organizationName } = userData;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    const user = new User({
      email,
      passwordHash,
      firstName,
      lastName,
      emailVerified: false
    });

    await user.save();

    // Create default organization if provided
    let organization = null;
    if (organizationName) {
      organization = new Organization({
        name: organizationName,
        owner: user.userId,
        description: `${firstName}'s organization`
      });
      await organization.save();

      // Add user to organization
      user.addOrganization(organization.orgId, 'admin');
      await user.update({ organizations: user.organizations });
    }

    // Generate token
    const token = this.generateToken({
      userId: user.userId,
      email: user.email,
      organizations: user.organizations
    });

    return {
      user: this.sanitizeUser(user),
      organization,
      token
    };
  }

  // Login user
  async login(email, password) {
    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = this.generateToken({
      userId: user.userId,
      email: user.email,
      organizations: user.organizations
    });

    return {
      user: this.sanitizeUser(user),
      token
    };
  }

  // Get user profile
  async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return this.sanitizeUser(user);
  }

  // Update user profile
  async updateProfile(userId, updates) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Only allow certain fields to be updated
    const allowedUpdates = ['firstName', 'lastName'];
    const filteredUpdates = {};
    
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    const updatedUser = await user.update(filteredUpdates);
    return this.sanitizeUser(updatedUser);
  }

  // Change password
  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(newPassword);

    // Update password
    await user.update({ passwordHash: newPasswordHash });

    return { success: true };
  }

  // Create organization
  async createOrganization(userId, organizationData) {
    const { name, description } = organizationData;

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create organization
    const organization = new Organization({
      name,
      description,
      owner: userId
    });

    await organization.save();

    // Add user to organization as admin
    user.addOrganization(organization.orgId, 'admin');
    await user.update({ organizations: user.organizations });

    return organization;
  }

  // Get user organizations
  async getUserOrganizations(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const organizations = [];
    for (const orgMembership of user.organizations) {
      const org = await Organization.findById(orgMembership.orgId);
      if (org) {
        organizations.push({
          ...org,
          userRole: orgMembership.role
        });
      }
    }

    return organizations;
  }

  // Add member to organization
  async addOrganizationMember(userId, orgId, memberEmail, role = 'viewer') {
    // Check if user has admin access to organization
    const organization = await Organization.findById(orgId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    if (!organization.hasAdminAccess(userId)) {
      throw new Error('Insufficient permissions');
    }

    // Find member by email
    const member = await User.findByEmail(memberEmail);
    if (!member) {
      throw new Error('User not found');
    }

    // Add member to organization
    organization.addMember(member.userId, role);
    await organization.update({ members: organization.members });

    // Add organization to user
    member.addOrganization(orgId, role);
    await member.update({ organizations: member.organizations });

    return {
      user: this.sanitizeUser(member),
      role
    };
  }

  // Remove member from organization
  async removeOrganizationMember(userId, orgId, memberId) {
    // Check if user has admin access to organization
    const organization = await Organization.findById(orgId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    if (!organization.hasAdminAccess(userId)) {
      throw new Error('Insufficient permissions');
    }

    // Cannot remove owner
    if (organization.owner === memberId) {
      throw new Error('Cannot remove organization owner');
    }

    // Remove member from organization
    organization.removeMember(memberId);
    await organization.update({ members: organization.members });

    // Remove organization from user
    const member = await User.findById(memberId);
    if (member) {
      member.removeOrganization(orgId);
      await member.update({ organizations: member.organizations });
    }

    return { success: true };
  }

  // Update member role
  async updateMemberRole(userId, orgId, memberId, newRole) {
    // Check if user has admin access to organization
    const organization = await Organization.findById(orgId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    if (!organization.hasAdminAccess(userId)) {
      throw new Error('Insufficient permissions');
    }

    // Cannot change owner role
    if (organization.owner === memberId) {
      throw new Error('Cannot change owner role');
    }

    // Update member role in organization
    organization.addMember(memberId, newRole);
    await organization.update({ members: organization.members });

    // Update organization role in user
    const member = await User.findById(memberId);
    if (member) {
      member.addOrganization(orgId, newRole);
      await member.update({ organizations: member.organizations });
    }

    return { success: true };
  }

  // Check if user has access to organization
  async checkOrganizationAccess(userId, orgId, requiredRole = null) {
    const user = await User.findById(userId);
    if (!user || !user.organizations || !Array.isArray(user.organizations)) {
      return false;
    }

    const membership = user.organizations.find(org => org.orgId === orgId);
    if (!membership) {
      return false;
    }

    if (requiredRole) {
      const roleHierarchy = { viewer: 1, dev: 2, admin: 3 };
      const userRoleLevel = roleHierarchy[membership.role] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
      return userRoleLevel >= requiredRoleLevel;
    }

    return true;
  }

  // Check if user has access to project
  async checkProjectAccess(userId, orgId, projectId, requiredRole = null) {
    const { Project } = require('../models');
    const project = await Project.findById(orgId, projectId);
    
    if (!project) {
      return false;
    }

    // Check organization access first
    const hasOrgAccess = await this.checkOrganizationAccess(userId, orgId);
    if (!hasOrgAccess && project.visibility === 'private') {
      return false;
    }

    // Check project-specific access
    return project.hasAccess(userId, requiredRole);
  }

  // Share project with user
  async shareProject(userId, orgId, projectId, memberEmail, role = 'viewer') {
    const { Project } = require('../models');
    
    // Check if user has admin access to organization or is project owner
    const hasOrgAccess = await this.checkOrganizationAccess(userId, orgId, 'admin');
    const project = await Project.findById(orgId, projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const isOwner = project.owner === userId;
    if (!hasOrgAccess && !isOwner) {
      throw new Error('Insufficient permissions to share project');
    }

    // Find member by email
    const member = await User.findByEmail(memberEmail);
    if (!member) {
      throw new Error('User not found');
    }

    // Share project
    await project.shareWith(member.userId, role);

    return {
      user: this.sanitizeUser(member),
      role,
      projectId: project.projectId
    };
  }

  // Unshare project from user
  async unshareProject(userId, orgId, projectId, memberId) {
    const { Project } = require('../models');
    
    // Check if user has admin access to organization or is project owner
    const hasOrgAccess = await this.checkOrganizationAccess(userId, orgId, 'admin');
    const project = await Project.findById(orgId, projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const isOwner = project.owner === userId;
    if (!hasOrgAccess && !isOwner) {
      throw new Error('Insufficient permissions to unshare project');
    }

    // Cannot unshare from owner
    if (project.owner === memberId) {
      throw new Error('Cannot unshare project from owner');
    }

    // Unshare project
    await project.unshareFrom(memberId);

    return { success: true };
  }

  // Update project member role
  async updateProjectMemberRole(userId, orgId, projectId, memberId, newRole) {
    const { Project } = require('../models');
    
    // Check if user has admin access to organization or is project owner
    const hasOrgAccess = await this.checkOrganizationAccess(userId, orgId, 'admin');
    const project = await Project.findById(orgId, projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const isOwner = project.owner === userId;
    if (!hasOrgAccess && !isOwner) {
      throw new Error('Insufficient permissions to update project member role');
    }

    // Cannot change owner role
    if (project.owner === memberId) {
      throw new Error('Cannot change project owner role');
    }

    // Update member role
    project.addMember(memberId, newRole);
    await project.update({ members: project.members });

    return { success: true };
  }

  // Get project members
  async getProjectMembers(userId, orgId, projectId) {
    const { Project } = require('../models');
    
    // Check if user has access to project
    const hasAccess = await this.checkProjectAccess(userId, orgId, projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const project = await Project.findById(orgId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Get member details
    const members = [];
    for (const member of project.members) {
      const user = await User.findById(member.userId);
      if (user) {
        members.push({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: member.role,
          addedAt: member.addedAt,
          isOwner: project.owner === user.userId
        });
      }
    }

    // Add owner if not already in members
    const ownerInMembers = members.find(m => m.userId === project.owner);
    if (!ownerInMembers) {
      const owner = await User.findById(project.owner);
      if (owner) {
        members.unshift({
          userId: owner.userId,
          email: owner.email,
          firstName: owner.firstName,
          lastName: owner.lastName,
          role: 'owner',
          addedAt: project.createdAt,
          isOwner: true
        });
      }
    }

    return members;
  }

  // Deactivate user account
  async deactivateAccount(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update user status
    await user.update({ isActive: false });

    return { success: true, message: 'Account deactivated successfully' };
  }

  // Verify user email
  async verifyEmail(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update email verification status
    await user.update({ emailVerified: true });

    return { success: true, message: 'Email verified successfully' };
  }

  // Get user's accessible projects across all organizations
  async getUserProjects(userId, limit = 50) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { Project } = require('../models');
    const allProjects = [];

    // Get projects from all user's organizations
    for (const orgMembership of user.organizations) {
      const orgProjects = await Project.findByOrganization(orgMembership.orgId, limit);
      
      // Filter projects based on access
      const accessibleProjects = orgProjects.filter(project => 
        project.hasAccess(userId) || project.visibility === 'organization' || project.visibility === 'public'
      );
      
      allProjects.push(...accessibleProjects);
    }

    // Remove duplicates and sort by updated date
    const uniqueProjects = allProjects.filter((project, index, self) => 
      index === self.findIndex(p => p.projectId === project.projectId)
    );

    return uniqueProjects.sort((a, b) => 
      new Date(b.updatedAt) - new Date(a.updatedAt)
    ).slice(0, limit);
  }

  // Sanitize user object (remove sensitive data)
  sanitizeUser(user) {
    const sanitized = { ...user };
    delete sanitized.passwordHash;
    return sanitized;
  }
}

module.exports = new AuthService();