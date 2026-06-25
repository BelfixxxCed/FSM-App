use std::time::{Duration, Instant};
use std::sync::Mutex;
use tauri::State;
use serde::{Serialize, Deserialize};
use tauri::Emitter;
use tauri_plugin_notification::NotificationExt;
use rodio::{Sink, Source};

#[cfg(target_os = "android")]
use tauri_plugin_haptics::HapticsExt;

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
    Initialize { mins: u32 },
    Pause,
    Play,
    End,
    SessionComplete,
}

struct Pomodoro {
    sessions: u32,
    duration_per_session: Duration,
    sessions_done: u32,
    state: States,
    session_start: Option<Instant>,
    session_duration_secs: u64,
    timer_task: Option<tauri::async_runtime::JoinHandle<()>>,
    timer_cancel: Option<tokio::sync::oneshot::Sender<()>>,
}

#[derive(Serialize)]
struct ReturnState {
    err_message: Option<String>,
    state: States,
    action_initialize: bool,
    action_pause: bool,
    action_play: bool,
    action_end: bool,
}

impl Pomodoro {
    fn new() -> Self {
        Pomodoro {
            sessions: 0,
            duration_per_session: Duration::from_secs(0),
            sessions_done: 0,
            state: States::Started,
            session_start: None,
            session_duration_secs: 0,
            timer_task: None,
            timer_cancel: None,
        }
    }

    fn transition(&mut self, action: Action, app_handle: tauri::AppHandle) -> Result<ReturnState, String> {
        match (&self.state, action) {

            (States::Started, Action::Initialize { mins }) => {
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

            (States::Ended, Action::Initialize { mins }) => {
                self.sessions_done = 0;
                self.session_start = None;
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

            (States::Session, Action::Pause) => {
                if let Some(start) = self.session_start {
                    let elapsed = start.elapsed().as_secs();
                    self.session_duration_secs = self.session_duration_secs.saturating_sub(elapsed);
                }
                self.session_start = None;
                self.cancel_timer();
                self.state = States::Paused;
                Ok(ReturnState {
                    err_message: None,
                    state: States::Paused,
                    action_initialize: true,
                    action_pause: false,
                    action_play: true,
                    action_end: true,
                })
            }

            (States::Session, Action::End) => {
                self.cancel_timer();
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

            (States::Session, Action::SessionComplete) => {
                self.sessions_done += 1;
                self.session_start = None;

                if self.sessions_done >= self.sessions {
                    self.state = States::Ended;
                    Ok(ReturnState {
                        err_message: None,
                        state: States::Ended,
                        action_initialize: true,
                        action_pause: false,
                        action_play: false,
                        action_end: false,
                    })
                } else if self.sessions_done % 4 == 0 {
                    self.session_duration_secs = 15 * 60;
                    self.session_start = Some(Instant::now()); 
                    self.state = States::LongBreak;
                    self.start_timer_task(app_handle.clone());
                    Ok(ReturnState {
                        err_message: None,
                        state: States::LongBreak,
                        action_initialize: false,
                        action_pause: true,
                        action_play: false,
                        action_end: true,
                    })
                } else {
                    self.session_duration_secs = 5 * 60;
                    self.session_start = Some(Instant::now());
                    self.state = States::Break;
                    self.start_timer_task(app_handle.clone());
                    Ok(ReturnState {
                        err_message: None,
                        state: States::Break,
                        action_initialize: false,
                        action_pause: true,
                        action_play: false,
                        action_end: true,
                    })
                }
            }

            (States::Paused, Action::Play) => {
                self.session_start = Some(Instant::now());
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

            (States::Paused, Action::End) => {
                self.cancel_timer();
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

            (States::Break, Action::Pause) => {
                if let Some(start) = self.session_start {
                    let elapsed = start.elapsed().as_secs();
                    self.session_duration_secs = self.session_duration_secs.saturating_sub(elapsed);
                }
                self.session_start = None;
                self.cancel_timer();
                self.state = States::Paused;
                Ok(ReturnState {
                    err_message: None,
                    state: States::Paused,
                    action_initialize: false,
                    action_pause: false,
                    action_play: true,
                    action_end: true,
                })
            }

            (States::Break, Action::End) => {
                self.cancel_timer();
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

            (States::Break, Action::SessionComplete) => {
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

            (States::LongBreak, Action::Pause) => {
                if let Some(start) = self.session_start {
                    let elapsed = start.elapsed().as_secs();
                    self.session_duration_secs = self.session_duration_secs.saturating_sub(elapsed);
                }
                self.session_start = None;
                self.cancel_timer();
                self.state = States::Paused;
                Ok(ReturnState {
                    err_message: None,
                    state: States::Paused,
                    action_initialize: false,
                    action_pause: false,
                    action_play: true,
                    action_end: true,
                })
            }

            (States::LongBreak, Action::End) => {
                self.cancel_timer();
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

            (States::LongBreak, Action::SessionComplete) => {
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

            (_, action) => Err(format!("Invalid action {:?} for current state", action)),
        }
    }

    fn cancel_timer(&mut self) {
        if let Some(cancel) = self.timer_cancel.take() {
            let _ = cancel.send(());
        }
        if let Some(handle) = self.timer_task.take() {
            handle.abort();
        }
    }

    fn start_timer_task(&mut self, app_handle: tauri::AppHandle) {
        self.cancel_timer();

        let duration = Duration::from_secs(self.session_duration_secs);
        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        self.timer_cancel = Some(cancel_tx);

        let handle = tauri::async_runtime::spawn(async move {
            tokio::select! {
                _ = tokio::time::sleep(duration) => {
                    play_beep();

                    #[cfg(target_os = "android")]
                    app_handle.haptics().impact_feedback(
                        tauri_plugin_haptics::ImpactFeedbackStyle::Heavy
                    ).unwrap();

                    app_handle
                        .notification()
                        .builder()
                        .title("Pomodoro")
                        .body("Session complete!")
                        .show()
                        .unwrap();

                    let _ = app_handle.emit("timer-finished", ());
                }
                _ = cancel_rx => {}
            }
        });
        self.timer_task = Some(handle);
    }
}

fn play_beep() {
    std::thread::spawn(|| {
        if let Ok((_stream, stream_handle)) = rodio::OutputStream::try_default() {
            if let Ok(sink) = Sink::try_new(&stream_handle) {
                for freq in [523.0, 659.0, 784.0, 523.0, 659.0, 784.0, 523.0, 659.0, 784.0] { // C, E, G chord
                    let beep = rodio::source::SineWave::new(freq)
                        .take_duration(Duration::from_millis(250))
                        .amplify(0.8);
                    sink.append(beep);
                }
                sink.sleep_until_end();
            }
        }
    });
}

fn minutes_to_sessions_calc(mins: u32, duration_per_session: &mut Duration, num_sessions: &mut u32) {
    let mut session_iterator: u32 = 1;
    let mut break_iterator: u32 = 0;
    let mut long_break_iterator: u32 = 0;
    let mut long_break_count: u32 = 4;

    if check(mins) {
        *duration_per_session = Duration::from_secs(u64::from(mins) * 60);
        *num_sessions = 1;
        return;
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
            break;
        }

        session_iterator += 1;
    }

    fn check(minutes_per_session: u32) -> bool {
        minutes_per_session <= 30
    }
}

#[tauri::command]
fn get_remaining(state: State<MyState>) -> Result<u64, String> {
    let pom = state.0.lock().unwrap();
    let remaining = match pom.session_start {
        Some(start) => {
            let elapsed = start.elapsed().as_secs();
            pom.session_duration_secs.saturating_sub(elapsed)
        }
        None => pom.session_duration_secs,
    };
    Ok(remaining)
}

struct MyState(Mutex<Pomodoro>);

#[tauri::command]
fn do_action(state: State<MyState>, action: Action, app_handle: tauri::AppHandle) -> Result<ReturnState, String> {
    let mut pom = state.0.lock().unwrap();
    let return_state = pom.transition(action, app_handle)?;
    Ok(return_state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_haptics::init());

    builder
        .manage(MyState(Mutex::new(Pomodoro::new())))
        .invoke_handler(tauri::generate_handler![
            do_action,
            get_remaining,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}