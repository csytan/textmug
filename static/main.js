(function(){


initPage = function(page){
    if (page.encrypted){
        $('#editor').hide();
        $('#lock_unlock').show();
    } else {
        var text = domToText($('#editor')[0]);
        var html = textToHTML(text);
        $('#editor').html(html)
            .focus();
    }


    $('.locked').click(function(){
        $('#decrypt_dialog, #editor').toggle();
        return false;
    });

    $('.unlocked').click(function(){
        $('#encrypt_dialog, #editor').toggle();
        return false;
    });

    $(document.body).click(function(){
        //$('#editor').focus();
    });


    $('#settings_dialog select[name="encrypt"]').change(function(){
        var encrypt = $(this).find('option:selected').val();
        encrypt = parseInt(encrypt);
        page.encrypted = encrypt;
        if (encrypt === 1){
            $('#settings_dialog .encrypt_password').show();
        } else {
            $('#settings_dialog .encrypt_password').hide();
        }
        console.log(encrypt);
    });


    $('.encrypt').click(function(){
        var password = $(this).parent().find('input[type="password"]').val();
        var plainText = domToText($('#editor')[0]);
        var cipherJSON = sjcl.encrypt(password, plainText);
        console.log(cipherJSON);
        page.text = JSON.stringify(cipherJSON);
        page.encrypted = true;
        $('#encrypt_dialog, .unlocked').hide();
        $('#decrypt_dialog, .locked').show();
        return false;
    });

    $('.decrypt').click(function(){
        var password = $(this).parent().find('input[type="password"]').val();
        var cipherJSON = $.parseJSON(page.text);
        var plainText = sjcl.decrypt(password, cipherJSON);
        $('#editor').html(textToHTML(plainText));
        $('#decrypt_dialog, .locked').hide();
        $('.unlocked').show();
        $('#editor').show().focus();
        return false;
    });


    $('.save').click(function(){
        var data = {
            text: domToText($('#editor')[0]),
            page_name: $('#page_name').val(),
            _xsrf: /_xsrf=([^;]+);/.exec(document.cookie)[1]
        };
        console.log(data);
        $.post('', data, function(response){
            if (response == 1){
                console.log('saved');
            } else {
                window.location.href = response;
            }
        });
        return false; 
    });

    $('.settings').click(function(){
        $('#settings_dialog, #editor').toggle();
        return false;
    });
    

    $('#editor')
        .keypress(function(e){
            // Browser normalization
            if (e.keyCode === 13){
                // Return key. Browsers use different elements as their 'empty' element.
                // More info:
                // http://lists.whatwg.org/pipermail/whatwg-whatwg.org/2011-May/031577.html

                var offsets = getCaretPositions(this);
                var text = domToText(this);

                // Delete selected text if exists
                text = text.slice(0, offsets[0]) + text.slice(offsets[1]);
                // Insert newline at first offset
                text = text.slice(0, offsets[0]) + '\n' + text.slice(offsets[0]);
                // Increment caret position
                offsets = [offsets[0] + 1, offsets[0] + 1];

                this.innerHTML = textToHTML(text);
                setCaretPositions(offsets, this);

                checkMismatch(this, text);
                return false;
            }
        })
        .keyup(function(e){
            if (e.keyCode >= 37 && e.keyCode <= 40){
                // Skip arrow keys
                return;
            }
            var offsets = getCaretPositions(this);
            var text = domToText(this);
            var html = textToHTML(text);
            this.innerHTML = html;
            setCaretPositions(offsets, this);
            checkMismatch(this, text);
        })
        .focus()
        .on('click', 'a', function(){
            window.open(this.href,'_blank');
        });
}

function checkMismatch(container, text){
    var text2 = domToText(container);
    if (text2 != text){
        console.log('Mismatch!------------');
        console.log('DOM --> TXT:');
        console.log(text);
        console.log('TXT --> HTML:')
        console.log(container.innerHTML);
        console.log('HTML --> DOM --> TXT:');
        console.log(text2);
    }
}


function partialUpdates(){
    // Ideas for only modifying part of the editor contents when text is modified

    // Make an HTML token list. Diff tokens lists first before modifying individual elements
    
    // Use html token list?
}


function isBlockElement(node){
    var blockElements = 'H1,H2,H3,H4,H5,H6,DIV,BLOCKQUOTE,PRE';
    if (blockElements.indexOf(node.tagName) === -1){
        return false;
    }
    return true;
}


function domToText(container){
    var text = '';

    function traverse(node){
        if (node.nodeType === 3){
            // Text Node
            text += node.nodeValue;
        }

        if (node !== container && isBlockElement(node) && node.innerText === '\n'){
            // Chrome uses block elements that only contain a <br>
            // as 'filler' for the caret after a new line
            // <div><br></div>, <pre><br></pre>, etc.
            // Skip traversing child nodes
        } else if (node.hasChildNodes()){
            for (var i=0, child; child=node.childNodes[i]; i++){
                traverse(child);
            }
        }

        if (node !== container && isBlockElement(node) && node.nextSibling){
            // Add a new line at the end of block elements
            // if the element is followed by another block element
            text += '\n';
        }
    }

    traverse(container);
    return text;
}




function lexer(text){
    var rules = {
        newline: /^\n/,
        heading: /^(#{1,6})[^\n]*/,
        blockquote: /^>[^\n]*/,
        li: /^(-{1,3})[^\n]*/,
        hr: /^-{4,}/,
        lh: /^[^\n]+:\n/,
        pre: /^```((?!```)[\s\S])+(```)?/,
        text: /^[^\n]+/
    };
    var tokens = [];
    var cap;

    while (text){
        // New lines
        if (cap = rules.newline.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'newline'
            });
            continue;
        }

        // Headings
        if (cap = rules.heading.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'heading',
                depth: cap[1].length,
                text: cap[0]
            });
            continue;
        }

        // Block quotes
        if (cap = rules.blockquote.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'blockquote',
                text: cap[0]
            });
            continue;
        }

        // Horizontal rules
        if (cap = rules.hr.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'hr',
                text: cap[0]
            });
            continue;
        }
        
        // List elements
        if (cap = rules.li.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'li',
                depth: cap[1].length,
                text: cap[0]
            });
            continue;
        }

        // List headers
        if (cap = rules.lh.exec(text)){
            var capTxt = cap[0].replace('\n', '');
            text = text.substring(capTxt.length);
            tokens.push({
                type: 'lh',
                text: capTxt
            });
            continue;
        }


        // Code blocks
        if (cap = rules.pre.exec(text)){
            text = text.substring(cap[0].length);
            var token = {
                type: 'pre',
                text: cap[0]
            };
            tokens.push(token);
            continue;
        }

        // Text
        if (cap = rules.text.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'div',
                text: cap[0]
            });
            continue;
        }

        if (text){
            alert('Big problems!!');
        }
    }
    return tokens;
};


function textToHTML(text){
    var tokens = lexer(text);
    var html = '';

    function allNewlines(){
        for (var i=0, token; token=tokens[i]; i++){
            if (token.type !== 'newline'){
                return false;
            }
        }
        return true;
    }

    function hasPrevBlock(index){
        for (var i=index, token; token=tokens[i]; i--){
            if (token.type !== 'newline'){
                return true;
            }
        }
        return false;
    }

    for (var i=0, token; token=tokens[i]; i++){
        if (token.type === 'newline'){
            var next = tokens[i + 1];

            if (i === 0 && allNewlines()){
                // If text is all newlines add an extra new line
                //  \n          <div><br></div>
                //              <div><br></div>
                //
                //  \n\n        <div><br></div>
                //              <div><br></div>
                //              <div><br></div>
                //
                html += '<div><br></div>';
            } else if (next && next.type !== 'newline' && hasPrevBlock(i)){
                // Skip a newline if next element is a block element
                // and there is previous block element before this one
                // a\na        <div>a</div>
                //             <div>a</div>
                // 
                // a\n\na      <div>a</div>
                //             <div><br></div>
                //             <div>a</div>
                continue;
            }
            html += '<div><br></div>';
        }

        if (token.type === 'heading'){
            html += '<h' + token.depth + '>' + inlineHTML(token.text) + '</h' + token.depth + '>';
            continue;
        }

        if (token.type === 'blockquote'){
            html += '<blockquote>' + inlineHTML(token.text) + '</blockquote>';
            continue;
        }

        if (token.type === 'hr'){
            html += '<div class="hr">' + inlineHTML(token.text) + '</div>';
            continue;
        }

        if (token.type === 'lh'){
            html += '<div class="lh">' + inlineHTML(token.text) + '</div>';
            continue;
        }

        if (token.type === 'li'){
            html += '<div class="li' + token.depth + '">' + inlineHTML(token.text) + '</div>';
            continue;
        }

        if (token.type === 'pre'){
            html += '<pre>' + escape(token.text) + '</pre>';
            continue;
        }

        if (token.type === 'div'){
            html += '<div>' + inlineHTML(token.text) + '</div>';
            continue;
        }
    }
    return html;
}


function escape(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};



function inlineHTML(text){
    var rules = {
        link: /^https?:\/\/[^\s<]+[^<.,:;"'\]\s]/,
        link: /^((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/,
        email: /^\S+@\S+/,
        code: /^`[^`]+`/,
        strong: /^\*\*[^\*]+?\*\*/,
        em: /^\*[^\*]+\*/
    };
    var html = '';

    while (text){
        // Links
        if (cap = rules.link.exec(text)){
            text = text.substring(cap[0].length);
            html += '<a href="' + escape(cap[0]) + '">' + escape(cap[0]) + '</a>';
            continue;
        }

        // Email
        if (cap = rules.email.exec(text)){
            text = text.substring(cap[0].length);
            html += '<a class="email" href="mailto:' + escape(cap[0]) + '">' + 
                escape(cap[0]) + 
            '</a>';
            continue;
        }

        // Code
        if (cap = rules.code.exec(text)){
            text = text.substring(cap[0].length);
            html += '<code>' + escape(cap[0]) + '</code>';
            continue;
        }

        // Strong
        if (cap = rules.strong.exec(text)){
            text = text.substring(cap[0].length);
            html += '<strong>' + escape(cap[0]) + '</strong>';
            continue;
        }

        // Em
        if (cap = rules.em.exec(text)){
            text = text.substring(cap[0].length);
            html += '<em>' + escape(cap[0]) + '</em>';
            continue;
        }

        // Text
        html += escape(text[0]);
        text = text.substring(1);
    }
    return html;
}



function getCaretPositions(element){
    // Returns the 0-indexed character offsets of the caret in
    // a contenteditable element.
    // 
    // https://developer.mozilla.org/en-US/docs/Web/API/Range.startOffset
    var range = window.getSelection().getRangeAt(0);

    //console.log('startRange:', range.startContainer, range.startOffset);
    //console.log('endRange:', range.endContainer, range.endOffset);

    function findOffset(node, container, rangeOffset, state){
        // Traverses the node tree depth-first to find a
        // range's character offset
        state = state || {finished: false};
        var offset = 0;

        if (node === container){
            // Found a match
            state.finished = true;

            if (node.nodeType === 3){
                // Text node: rangeOffset == n'th character
                offset += rangeOffset;
            } else {
                // Non-text node: rangeOffset == n child nodes
                for (var i=0; i < rangeOffset; i++){
                    offset += findOffset(node.childNodes[i], container, rangeOffset, state);
                }
            }
            return offset;
        } 

        if (node.nodeType === 3){
            // Text Node
            offset += node.nodeValue.length;
        }

        if (node.hasChildNodes()){
            for (var i=0, child; child=node.childNodes[i]; i++){
                offset += findOffset(child, container, rangeOffset, state);
                if (state.finished){
                    return offset;
                }
            }
        }

        if (isBlockElement(node)){
            // The end of <h1> or <div> counts as new line
            offset += 1;
        }
        return offset;
    }

    var startOffset = findOffset(element, range.startContainer, range.startOffset);
    var endOffset = findOffset(element, range.endContainer, range.endOffset);

    return [startOffset, endOffset];
}


function setCaretPositions(offsets, element){
    // Sets the caret positions on a content editable DOM element

    function findOffset(node, offset){
        if (node.nodeType === 3){
            // Text node
            if (offset <= node.nodeValue.length){
                return [node, offset];
            }
            offset -= node.nodeValue.length;
        }

        if (offset === 0){
            return [node, offset];
        }

        if (node.hasChildNodes()){
            for (var i=0, child; child=node.childNodes[i]; i++){
                var result = findOffset(child, offset);
                offset = result[1];
                if (result[0] !== null){
                    return result;
                }
            }
        } 

        if (isBlockElement(node)){
            // The end of <h1> or <div> counts as new line
            offset -= 1;
        }

        return [null, offset];
    }

    var range = document.createRange();
    var sel = window.getSelection();
    
    var startOffset = findOffset(element, offsets[0]);
    range.setStart(startOffset[0], startOffset[1]);

    if (offsets[0] === offsets[1]){
        range.collapse(true);
    } else {
        var endOffset = findOffset(element, offsets[1]);
        range.setEnd(endOffset[0], endOffset[1]);
    }

    sel.removeAllRanges();
    sel.addRange(range);
}


})();








