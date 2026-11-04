#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod add_knowledge;
mod add_knowledge_http;
mod add_knowledge_input;
mod add_knowledge_progress;
mod add_knowledge_subject_check;
mod api_client;
mod commands;
mod cram;
mod review;
mod review_actions;
mod review_api;
mod review_cache;
mod review_history;
mod review_scope;
mod review_sync;
mod review_undo;
mod session;
mod settings_account;
mod settings_admin;
mod settings_commands;
mod settings_daily_goal;
mod settings_fields;
mod settings_http;
mod settings_subject_options;
mod subject_commands;
mod subject_http;
mod subject_requests;
mod subjects;
mod triage;
mod triage_actions;
mod triage_api;
mod triage_list_commands;
mod triage_lists;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            std::fs::create_dir_all(app.path().app_data_dir()?)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::has_session,
            commands::sign_in,
            commands::sign_out,
            commands::get_subjects,
            add_knowledge::add_knowledge,
            add_knowledge_subject_check::check_knowledge_subject,
            add_knowledge_progress::get_knowledge_source_status,
            cram::get_subject_cards,
            review::get_due_cards,
            review::grade_card,
            review::sync_pending_grades,
            review_actions::control_card,
            review_actions::edit_card,
            review_scope::get_review_due_counts,
            review_undo::undo_last_grade,
            subject_commands::create_subject,
            subject_commands::rename_subject,
            subject_commands::delete_subject,
            subject_commands::get_subject_bits,
            settings_commands::get_subject_study_options,
            settings_commands::update_subject_study_options,
            settings_commands::get_admin_settings,
            settings_commands::update_admin_settings,
            settings_commands::get_daily_goal,
            settings_commands::save_daily_goal,
            settings_commands::get_account,
            settings_commands::update_account_name,
            triage::get_triage_items,
            triage::decide_triage_item,
            triage_list_commands::list_inbox_items,
            triage_list_commands::list_chat_items,
            triage_list_commands::list_rejected_items,
            triage_list_commands::list_suspended_items,
            triage_actions::undo_triage_decision,
            triage_actions::send_to_chat,
            triage_actions::return_from_chat,
            triage_actions::snooze_chat,
            triage_actions::return_from_inbox,
            triage_actions::discard_from_inbox,
            triage_actions::approve_inbox_item,
            triage_actions::edit_knowledge_bit,
            triage_actions::approve_bulk,
            triage_actions::restore_rejected,
            triage_actions::bring_back_suspended,
        ])
        .run(tauri::generate_context!())
        .expect("error while running post-anki-desktop");
}
