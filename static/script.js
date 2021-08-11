fetch("/api/profile")
  .then(res => res.json())
  .then(auth => { if (auth) { authenticated() } })

function authenticated () {
  document.getElementById("auth").classList.add("yes") 

  fetch("/api/guilds")
    .then(res => res.json())
    .then(data => data.map(getGuildElement).forEach((el) => document.getElementById("guilds").appendChild(el)))
}

function getGuildElement(des) {
  var div = document.createElement("div")
  div.innerHTML = `<a class="discord-invite" href=${des.Link} target="_blank">
		     <img src="https://cdn.discordapp.com/icons/${des.ServerId}/${des.IconHash}.png?size=64" />
		     <div> <span class="title">${des.Name}</span> <br/> ${des.Range} </div>
		   </a>`
  return div
}
