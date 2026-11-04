use keyring::{Entry, Error};

const SERVICE: &str = "online.ilya.postanki.desktop";
const ACCOUNT: &str = "session-token";

pub fn has_session() -> bool {
    matches!(load_token(), Ok(Some(_)))
}

pub fn load_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read the saved session from the Keychain.".to_string()),
    }
}

pub fn save_token(token: &str) -> Result<(), String> {
    entry()?
        .set_password(token)
        .map_err(|_| "Could not save the session to the Keychain.".to_string())
}

pub fn clear_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the saved session from the Keychain.".to_string()),
    }
}

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|_| "The Keychain is unavailable.".to_string())
}
