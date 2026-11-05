/** No raw server errors (which can include addresses or configuration) in UI/logs. */
export function accountError(error:unknown):string{
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 switch(code){
 case 'auth/invalid-credential':case 'auth/user-not-found':case 'auth/wrong-password':return 'The email or password is incorrect.';
 case 'auth/invalid-email':return 'Enter a valid email address.';
 case 'auth/email-already-in-use':return 'Unable to create this account. Try signing in or resetting your password.';
 case 'auth/weak-password':case 'auth/password-does-not-meet-requirements':return 'Choose a stronger password that meets the project’s password policy.';
 case 'auth/too-many-requests':return 'Too many attempts. Please wait before trying again.';
 case 'auth/network-request-failed':return 'Couldn’t reach Firebase. Check your connection and try again. Offline learning still works.';
 case 'auth/operation-not-allowed':case 'auth/admin-restricted-operation':return 'Email/password sign-in must be enabled by the project owner in Firebase Authentication.';
 case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':case 'auth/invalid-api-key':case 'auth/app-not-authorized':case 'auth/configuration-not-found':return 'Firebase needs an owner configuration check. Confirm Authentication is initialized and this API key allows the app.';
 case 'auth/requires-recent-login':return 'Sign in again, then retry this action.';
 case 'auth/user-disabled':return 'This account is unavailable. Contact the app owner.';
 case 'genz/cloud-deletion-failed':return 'Couldn’t delete your cloud data, so nothing was deleted. Check your connection and try again.';
 case 'genz/auth-deletion-incomplete':return 'Your cloud learning data was deleted, but the sign-in account still exists. Sign in again and repeat deletion to finish.';
 default:return 'Couldn’t complete that action. Please retry. Your offline learning remains available.';
 }
}
export function validateCredentials(email:string,password:string,creating=false):string|null{
 if(email.trim().length>254||!/^\S+@\S+\.\S+$/.test(email.trim()))return 'Enter a valid email address.';
 if(!password)return 'Enter your password.';
 if(password.length>4096)return 'This password is too long.';
 if(creating&&password.length<12)return 'Use at least 12 characters for your new password.';
 return null;
}
export const secureStorageKey=(key:string)=>'genz.auth.'+[...key].map(c=>/^[a-zA-Z0-9]$/.test(c)?c:'_'+c.codePointAt(0)!.toString(16)+'_').join('');
