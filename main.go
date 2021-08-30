package main

import (
    "fmt"
    "log"
    "net/http"
    "os"
    "encoding/json"
    "regexp"

    "github.com/gorilla/mux"
    "github.com/gorilla/sessions"

    "github.com/markbates/goth"
    "github.com/markbates/goth/gothic"
    "github.com/markbates/goth/providers/google"

    "gorm.io/gorm"
    "gorm.io/driver/sqlite"
)

var store = sessions.NewCookieStore([]byte(os.Getenv("SESSION_SECRET")))
var db, err = gorm.Open(sqlite.Open("bot/sq.db"), &gorm.Config{})

func CallbackHandler(res http.ResponseWriter, req *http.Request) {
    user, err := gothic.CompleteUserAuth(res, req)
    if err != nil {
        fmt.Fprintln(res, err)
        return
    }

    session, _ := store.Get(req, "session-name")
    session.Values["email"] = user.Email
    fmt.Println(session.Values["email"])
    err = session.Save(req, res)

    res.Header().Set("Location", "/")
    res.WriteHeader(http.StatusTemporaryRedirect)
}

func AuthHandler(res http.ResponseWriter, req *http.Request) {
    if user, err := gothic.CompleteUserAuth(res, req); err == nil {
        fmt.Println(user)
    } else {
        gothic.BeginAuthHandler(res, req)
    }
}

func ProfileHandler(res http.ResponseWriter, req *http.Request) {
    session, _ := store.Get(req, "session-name")
    email := session.Values["email"]
    if email == nil {
        res.Write([]byte("false"))
    } else {
        match, _ := regexp.MatchString("umn\\.edu$", email.(string))
        if match {
            res.Write([]byte("true"))
        } else {
            res.Write([]byte("false"))
        }
    }
}

type Guild struct {
    Link string
    Name string
    ServerId string
    IconHash string
    Range string
}

func ServeGuilds(res http.ResponseWriter, req *http.Request) {
    session, _ := store.Get(req, "session-name")
    email := session.Values["email"]
    if email == nil {
        res.Write([]byte(""))
    } else {
        match, _ := regexp.MatchString("umn\\.edu$", email.(string))
        if match == false {
            return
        }

        var guilds []Guild
        db.Find(&guilds)
        res.Header().Set("Content-Type", "application/json")
        json.NewEncoder(res).Encode(guilds)
    }
}

func RedirectHandler(w http.ResponseWriter, req *http.Request) {
    target := "https://" + req.Host + req.URL.Path
    if len(req.URL.RawQuery) > 0 {
        target += "?" + req.URL.RawQuery
    }
    http.Redirect(w, req, target, http.StatusPermanentRedirect)
}

func main() {
    db.AutoMigrate(&Guild{})

    http.Handle("/", http.FileServer(http.Dir("static/")))
    port := os.Getenv("PORT")

    redirect := "http://localhost:"+port+"/api/callback/google"
    if os.Getenv("BUILD") == "PROD" {
        redirect = "https://studentrun.chat/api/callback/google"
    }

    goth.UseProviders(
        google.New(os.Getenv("GOOGLE_KEY"), os.Getenv("GOOGLE_SECRET"), redirect),
    )

    r := mux.NewRouter()
    r.HandleFunc("/api/callback/{provider}", CallbackHandler)
    r.HandleFunc("/api/auth/{provider}", AuthHandler)
    r.HandleFunc("/api/profile", ProfileHandler)
    r.HandleFunc("/api/guilds", ServeGuilds)

    http.Handle("/api/", r)

    fmt.Println("listening on localhost:" + port)
    if os.Getenv("BUILD") == "PROD" {
        go http.ListenAndServe(":80", http.HandlerFunc(RedirectHandler))
        log.Fatal(http.ListenAndServeTLS(":" + port, "/etc/letsencrypt/live/studentrun.chat-0001/fullchain.pem", "/etc/letsencrypt/live/studentrun.chat-0001/privkey.pem", nil))
    } else {
        log.Fatal(http.ListenAndServe(":" + port, nil))
    }
}
