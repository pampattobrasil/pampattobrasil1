(function(){

"use strict";


/*
 LOGIN
*/

window.fazerLogin = function(){


    let usuario = document.getElementById("usuario");
    let senha = document.getElementById("senha");


    if(!usuario || !senha){

        console.error(
            "Campos de login não encontrados"
        );

        return;

    }


    let user = usuario.value.trim();
    let pass = senha.value.trim();



    console.log(
        "Tentativa login:",
        user
    );



    // usuário padrão de teste

    if(
        user === "teste" &&
        pass === "teste"
    ){


        console.log(
            "Login autorizado"
        );


        let login = document.getElementById("login");


        if(login){

            login.style.display="none";

        }



        let sistema = document.getElementById("app");


        if(sistema){

            sistema.style.display="block";

        }



        if(typeof openTab === "function"){

            openTab("dashboard");

        }


        if(typeof renderAll === "function"){

            renderAll();

        }


        return true;


    }



    alert(
        "Usuário ou senha inválidos"
    );


    return false;


};



/*
 ABAS
*/


window.openTab=function(nome){


    document.querySelectorAll(".tab")
    .forEach(function(t){

        t.classList.remove("active");

    });



    let aba=document.getElementById(
        "tab-"+nome
    );


    if(aba){

        aba.classList.add("active");

    }



};



/*
 MENU
*/

function iniciarMenus(){


document.querySelectorAll("[data-tab]")
.forEach(function(btn){


    btn.onclick=function(){


        openTab(
            this.dataset.tab
        );


    };


});


}




window.renderAll=function(){

console.log(
"Renderização iniciada"
);


};



document.addEventListener(
"DOMContentLoaded",
function(){

iniciarMenus();

console.log(
"Sistema carregado"
);


});


})();
