/*
=====================================================
 PAMPATTO BRASIL - APP JS
 Controle de menus, abas e inicialização
=====================================================
*/


(function () {

"use strict";


/*
=====================================================
 ABRIR MENUS
=====================================================
*/

window.openTab = function(tabName){

    console.log("Abrindo aba:", tabName);


    // Esconde todas as abas
    document.querySelectorAll(".tab").forEach(function(tab){

        tab.classList.remove("active");

    });



    // Mostra a aba selecionada
    let tela = document.getElementById("tab-" + tabName);


    if(tela){

        tela.classList.add("active");

    }
    else{

        console.warn(
            "Aba não encontrada:",
            "tab-" + tabName
        );

    }



    // Atualiza botão ativo

    document.querySelectorAll("[data-tab]").forEach(function(btn){

        btn.classList.remove("active");


        if(btn.dataset.tab === tabName){

            btn.classList.add("active");

        }

    });


};



/*
=====================================================
 INICIALIZA OS MENUS
=====================================================
*/

function iniciarMenus(){


    let botoes = document.querySelectorAll("[data-tab]");


    console.log(
        "Menus encontrados:",
        botoes.length
    );


    botoes.forEach(function(botao){


        botao.onclick = function(){


            let aba = this.getAttribute("data-tab");


            openTab(aba);


        };


    });


}



/*
=====================================================
 RENDERIZAÇÃO GERAL
=====================================================
*/

window.renderAll = function(){


    console.log(
        "Executando renderAll"
    );


    // Dashboard

    if(typeof renderDashboard === "function"){

        renderDashboard();

    }



    // Produtos

    if(typeof renderProdutos === "function"){

        renderProdutos();

    }



    // Estoque

    if(typeof renderEstoque === "function"){

        renderEstoque();

    }



    // Pedidos

    if(typeof renderPedidos === "function"){

        renderPedidos();

    }



};



/*
=====================================================
 INICIO DO SISTEMA
=====================================================
*/


document.addEventListener(
"DOMContentLoaded",
function(){


    console.log(
        "Pampatto iniciado"
    );


    iniciarMenus();


    renderAll();



});



})();
