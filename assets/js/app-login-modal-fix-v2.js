// CORREÇÃO LOGIN / MODAL PEDIDO - v20260728.21

(function corrigirLoginPampatto(){

    const loginForm = document.getElementById('loginForm');

    if(!loginForm) return;

    const modal = document.getElementById('orderSuccessModal');

    if(modal){
        modal.classList.remove('open');
        modal.style.display = 'none';
    }

    loginForm.onsubmit = function(e){

        e.preventDefault();

        const usuario = (
            document.getElementById('login')?.value || ''
        ).trim().toLowerCase();

        const senha = 
            document.getElementById('senha')?.value || '';


        let usuarios = [];

        try {

            const state = JSON.parse(
                localStorage.getItem('pampattoStateV4') || '{}'
            );

            usuarios = state.usuarios || [];

        } catch(err){}



        let user = usuarios.find(u =>

            String(u.usuario || '').toLowerCase() === usuario &&

            String(u.senha || '') === senha &&

            u.ativo !== false

        );



        // LOGIN DE TESTE

        if(!user && usuario === 'teste' && senha === 'teste'){

            user = {

                id:'admin',

                nome:'Administrador',

                usuario:'teste',

                senha:'teste',

                perfil:'admin',

                ativo:true

            };

        }



        if(!user){

            const erro = document.getElementById('errorAlert');

            if(erro){

                erro.style.display='block';

                erro.textContent='Usuário ou senha inválidos.';

            }

            return;

        }



        window.currentUser = user;



        const loginPage =
            document.getElementById('loginPage');

        const appPage =
            document.getElementById('appPage');



        if(loginPage){

            loginPage.style.display='none';

        }



        if(appPage){

            appPage.style.display='block';

        }



        if(typeof openTab === 'function'){

            openTab('dashboard');

        }



        if(typeof renderAll === 'function'){

            renderAll();

        }

    };


})();



// GARANTE QUE O MODAL NÃO APAREÇA NO LOGIN

document.addEventListener('DOMContentLoaded',()=>{


    const modal =
        document.getElementById('orderSuccessModal');


    if(modal){


        modal.style.display='none';



        const observer =
            new MutationObserver(()=>{


                if(!modal.classList.contains('open')){


                    modal.style.display='none';


                }


            });



        observer.observe(modal,{

            attributes:true,

            attributeFilter:['class']

        });


    }


});