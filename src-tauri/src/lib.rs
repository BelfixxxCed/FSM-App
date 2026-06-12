
use std::time::{Duration, Instant};
use std::sync::Mutex;
use tauri::State;
use serde::{Serialize, Deserialize};
use tauri::{Emitter};

// enum Operators {
//     Addition,
//     Subtraction,
//     Multiplication,
//     Division
// }

// impl Operators {
//     fn from_char(c: char) -> Option<Self>{
//         match c {
//             '+' => Some(Operators::Addition),
//             '-' => Some(Operators::Subtraction),
//             'x' => Some(Operators::Multiplication),
//             '*' => Some(Operators::Multiplication),
//             '/' => Some(Operators::Division),
//             _ => None
//          }
//     }
// }

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// #[tauri::command]
// fn greet(name: &str) -> String {
//     format!("Hello, {}! You've been greeted from Rust!", name)
// }


// #[tauri::command]
// fn calculate(num1: f32, num2: f32, operator: String) -> Result<f32, String>{
//     if operator.len() > 1{
//         return Err("The fuck, too long bitch".to_string());
//     }

//     let operator : char = match operator.trim().chars().next(){
//         Some(a) => a,
//         None => return Err("No operator".to_string())
//     };

//     let operation = match Operators::from_char(operator){
//         Some(temp) => temp,
//         None => return Err("Error in input".to_string())
//     };

//     match operation {
//         Operators::Addition => Ok(num1 + num2),
//         Operators::Subtraction => Ok(num1 - num2),
//         Operators::Multiplication => Ok(num1 * num2),
//         Operators::Division => {
//             if num2 != 0.0 {
//                 Ok(num1 / num2)
//             } else {
//                 Err("Division by zero".to_string())
//             }
//         }
//     }

// }


// =======================       SEPARATOR          ====================================


#[derive(Serialize)]
enum States {
    Paused,
    Started,
    Session,
    Break,
    LongBreak,
    Initialized,
    Ended,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum Action {
    Initialize {
        mins : u32
    },
    Pause,
    Play,
    End,
}

struct Pomodoro {
    sessions : u32,
    duration_per_session : Duration,
    sessions_done : u32,
    state : States,

    session_start : Option<Instant>,
    session_duration_secs : u64,
    timer_task : Option<tokio::task::JoinHandle<()>>,
    timer_cancel : Option<tokio::sync::oneshot::Sender<()>>,
}

#[derive(Serialize)]
struct ReturnState {
    err_message : Option<String>,
    state : States,
    action_initialize : bool,
    action_pause : bool,
    action_play : bool,
    action_end : bool,
}


impl Pomodoro {
    fn new() -> Self {
        Pomodoro { 
            sessions: (0), 
            duration_per_session: (Duration::from_secs(0)), 
            sessions_done: (0), 
            state: (States::Started),
            session_start : None,
            session_duration_secs : 0,
            timer_task : None,
            timer_cancel : None,
        }
    }

    fn transition(&mut self, action : Action, app_handle: tauri::AppHandle) -> Result<ReturnState, String>{

        match (&self.state, action){

            (States::Started, Action::Initialize {mins }) => {
                self.state = States::Initialized;
                minutes_to_sessions_calc(mins, &mut self.duration_per_session, &mut self.sessions);
                Ok(ReturnState { 
                    err_message: None, 
                    state: States::Initialized, 
                    action_initialize: false, 
                    action_pause: false, 
                    action_play: true, 
                    action_end: false, 
                })
            }

            (States::Initialized, Action::Play) => {
                self.session_start = Some(Instant::now());
                self.session_duration_secs = self.duration_per_session.as_secs();
                self.state = States::Session;
                self.start_timer_task(app_handle.clone());
                Ok(ReturnState { 
                    err_message: None, 
                    state: States::Session, 
                    action_initialize: true, 
                    action_pause: true, 
                    action_play: false, 
                    action_end: true, 
                })
            }

            (States::Session, Action::End) => {
                self.state = States::Ended;
                Ok(ReturnState { 
                    err_message: None, 
                    state: States::Ended, 
                    action_initialize: true, 
                    action_pause: false, 
                    action_play: false, 
                    action_end: false, 
                })
            }

            (States::Session, Action::Pause) =>  {
                self.state = States::Paused;
                Ok(ReturnState{
                    err_message: None,
                    state: States::Paused,
                    action_initialize: true,
                    action_end : true,
                    action_pause : false,
                    action_play: true,
                })
            }

        }

    }

    
    fn start_timer_task(&mut self, app_handle: tauri::AppHandle){
        if let Some(cancel) = self.timer_cancel.take() {
            let _ = cancel.send(());
        }
        if let Some(handle) = self.timer_task.take() {
            handle.abort()
        }

        let duration = Duration::from_secs(self.session_duration_secs);
        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        self.timer_cancel = Some(cancel_tx);

        let handle = tokio::spawn(async move {
            tokio::select! {
                _ = tokio::time::sleep(duration) => {
                    let _ = app_handle.emit("timer-finished", ());
                }

                _ = cancel_rx => {
                    // Do nothing
                }
            }
        });
        self.timer_task = Some(handle);
    }
}

fn minutes_to_sessions_calc(mins : u32, duration_per_session : &mut Duration, num_sessions : &mut u32) {
    
    let mut session_iterator : u32 = 1;
    let mut break_iterator : u32 = 0;
    let mut long_break_iterator : u32 = 0;

    let mut long_break_count: u32 = 4;

    if check(mins){
        *duration_per_session = Duration::from_secs(u64::from(mins) * 60);
        *num_sessions = 1;
        return
    }

    loop {
        if long_break_count == 0 {
            long_break_iterator += 1;
            long_break_count = 4;
        } else {
            break_iterator += 1;
            long_break_count -= 1;
        }

        let total_breaks = 5 * break_iterator;
        let total_long_break = 15 * long_break_iterator;
        let total_of_breaks = total_breaks + total_long_break;

        if total_of_breaks >= mins {
            *duration_per_session = Duration::from_secs(0);
            *num_sessions = 1;
            break;
        }

        let mins_per_session = (mins - total_of_breaks) / session_iterator;
        if check(mins_per_session) {
            *duration_per_session = Duration::from_secs(u64::from(mins_per_session * 60));
            *num_sessions = session_iterator;
            break
        }

        session_iterator += 1;
    }


    fn check (minutes_per_session : u32) -> bool {
        if minutes_per_session <= 30 {
            true
        } else {
            false
        }
    }
}


#[tauri::command]
fn get_remaining(state: State<MyState>) -> Result<u64, String> {
    let pom = state.0.lock().unwrap();
    let remaining = match pom.session_start{
        Some(start) => {
            let elapsed = start.elapsed().as_secs();
            pom.session_duration_secs.saturating_sub(elapsed)
        }
        None => 0,
    };
    Ok(remaining)
}


struct MyState(Mutex<Pomodoro>);

#[tauri::command]
fn do_action(state : State<MyState>, action : Action, app_handle : tauri::AppHandle) -> Result<ReturnState, String> {
    let mut pom = state.0.lock().unwrap();
    let return_state  = pom.transition(action, app_handle)?;
    Ok(return_state)
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            
            // greet,
            // calculate
            do_action

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
