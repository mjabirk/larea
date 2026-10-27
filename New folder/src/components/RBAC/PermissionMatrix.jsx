import React from 'react';
import { RolesView } from './RolesView';

/**
 * PermissionMatrix (Wrapper with proper prop forwarding)
 * Re-exports RolesView which houses the RBAC permission matrix engine.
 */
export function PermissionMatrix(props) {
  return <RolesView {...props} />;
}

export { RolesView };
export default PermissionMatrix;
