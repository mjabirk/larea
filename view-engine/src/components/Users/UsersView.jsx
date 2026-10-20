import React from 'react';
import { UserListView } from './UserListView';

/**
 * UsersView (Wrapper with proper prop forwarding)
 * Re-exports UserListView which houses the system users and accounts management view.
 */
export function UsersView(props) {
  return <UserListView {...props} />;
}

export { UserListView };
export default UsersView;
